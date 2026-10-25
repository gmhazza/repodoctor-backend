import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createApp } from '../src/app.js';
import { AnalyzerService } from '../src/services/analyzer.service.js';
import { AnalyzeController } from '../src/controllers/analyze.controller.js';
import { validateAnalyzeRequest } from '../src/middleware/validation.middleware.js';
import { errorHandler } from '../src/middleware/error.middleware.js';

describe('API Routes & Error Handling', () => {
  let app;

  beforeEach(() => {
    app = createApp();
  });

  it('GET /health returns service health and configuration metadata', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body).toHaveProperty('uptime');
    expect(res.body).toHaveProperty('model');
  });

  it('POST /api/analyze returns 400 if repository field is missing', async () => {
    const res = await request(app).post('/api/analyze').send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MISSING_REPOSITORY');
  });

  it('POST /api/analyze returns 400 if repository URL is invalid', async () => {
    const res = await request(app)
      .post('/api/analyze')
      .send({ repository: 'https://gitlab.com/user/project' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REPOSITORY_URL');
  });

  it('POST /api/analyze handles 404 repository not found error gracefully', async () => {
    const mockGithub = {
      getRepositoryDetails: vi.fn().mockImplementation(() => {
        const err = new Error('GitHub repository or resource not found or private');
        err.status = 404;
        err.code = 'REPOSITORY_NOT_FOUND';
        throw err;
      }),
    };

    const analyzerService = new AnalyzerService({ githubService: mockGithub });
    const controller = new AnalyzeController(analyzerService);

    const testApp = express();
    testApp.use(express.json());
    testApp.post('/api/analyze', validateAnalyzeRequest, controller.analyze);
    testApp.use(errorHandler);

    const res = await request(testApp)
      .post('/api/analyze')
      .send({ repository: 'https://github.com/nonexistent-org/nonexistent-repo' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('REPOSITORY_NOT_FOUND');
  });

  it('POST /api/analyze handles GitHub API rate limit error gracefully', async () => {
    const mockGithub = {
      getRepositoryDetails: vi.fn().mockImplementation(() => {
        const err = new Error('GitHub API rate limit exceeded');
        err.status = 429;
        err.code = 'GITHUB_RATE_LIMIT_EXCEEDED';
        throw err;
      }),
    };

    const analyzerService = new AnalyzerService({ githubService: mockGithub });
    const controller = new AnalyzeController(analyzerService);

    const testApp = express();
    testApp.use(express.json());
    testApp.post('/api/analyze', validateAnalyzeRequest, controller.analyze);
    testApp.use(errorHandler);

    const res = await request(testApp)
      .post('/api/analyze')
      .send({ repository: 'https://github.com/facebook/react' });

    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('GITHUB_RATE_LIMIT_EXCEEDED');
  });

  it('POST /api/analyze performs successful analysis with summary and isolated failures', async () => {
    const mockGithub = {
      getRepositoryDetails: vi.fn().mockResolvedValue({
        owner: 'testowner',
        name: 'testrepo',
        defaultBranch: 'main',
        isPrivate: false,
        sizeKb: 50,
      }),
      getRepositoryTree: vi.fn().mockResolvedValue({
        tree: [
          { path: 'src/good.js', type: 'blob', size: 200 },
          { path: 'src/bad.js', type: 'blob', size: 300 },
          { path: 'package-lock.json', type: 'blob', size: 1000 },
          { path: 'node_modules/dep/index.js', type: 'blob', size: 500 },
        ],
        truncated: false,
      }),
      getFileContent: vi.fn().mockImplementation((owner, repo, filePath) => {
        if (filePath === 'src/good.js') {
          return Promise.resolve('const a = 1;');
        }
        if (filePath === 'src/bad.js') {
          return Promise.resolve('const b = 2;');
        }
        return Promise.resolve('');
      }),
    };

    const mockGemini = {
      analyzeFile: vi.fn().mockImplementation(({ filePath }) => {
        if (filePath === 'src/good.js') {
          return Promise.resolve({
            problems: [
              {
                line: 1,
                severity: 'medium',
                category: 'code-smell',
                title: 'Unused variable',
                description: 'Variable a is unused',
                suggestedFix: 'Remove variable a',
              },
            ],
          });
        }
        if (filePath === 'src/bad.js') {
          const err = new Error('Gemini quota reached');
          err.status = 429;
          err.code = 'GEMINI_RATE_LIMIT';
          throw err;
        }
      }),
    };

    const analyzerService = new AnalyzerService({
      githubService: mockGithub,
      geminiService: mockGemini,
      concurrency: 2,
    });
    const controller = new AnalyzeController(analyzerService);

    const testApp = express();
    testApp.use(express.json());
    testApp.post('/api/analyze', validateAnalyzeRequest, controller.analyze);
    testApp.use(errorHandler);

    const res = await request(testApp)
      .post('/api/analyze')
      .send({ repository: 'https://github.com/testowner/testrepo' });

    expect(res.status).toBe(200);

    // Verify response structure strictly adheres to Section 16 specification
    expect(res.body.repository).toEqual({
      owner: 'testowner',
      name: 'testrepo',
    });

    expect(res.body.summary).toEqual({
      totalFiles: 4,
      analyzedFiles: 1,
      skippedFiles: 2,
      problems: 1,
      critical: 0,
      high: 0,
      medium: 1,
      low: 0,
    });

    expect(res.body.problems).toHaveLength(1);
    expect(res.body.problems[0]).toEqual({
      file: 'src/good.js',
      line: 1,
      severity: 'medium',
      category: 'code-smell',
      title: 'Unused variable',
      description: 'Variable a is unused',
      suggestedFix: 'Remove variable a',
    });

    expect(res.body.skippedFiles).toEqual(
      expect.arrayContaining([
        { file: 'package-lock.json', reason: 'IGNORED_LOCKFILE' },
        { file: 'node_modules/dep/index.js', reason: 'IGNORED_DIRECTORY' },
      ])
    );

    // Verify error isolation
    expect(res.body.failedFiles).toHaveLength(1);
    expect(res.body.failedFiles[0]).toEqual({
      file: 'src/bad.js',
      error: 'GEMINI_RATE_LIMIT',
    });
  });
});
