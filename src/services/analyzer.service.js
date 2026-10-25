import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { validateRepositoryUrl } from '../utils/validation.js';
import { containsSecrets } from '../utils/secret-detector.js';
import { defaultFileFilter } from './file-filter.service.js';
import { ConcurrencyPool } from './concurrency.service.js';
import { ProgressTracker } from './progress.service.js';
import { githubService } from './github.service.js';
import { geminiService } from './gemini.service.js';
import { SKIP_REASONS } from '../config/constants.js';

export class AnalyzerService {
  constructor(options = {}) {
    this.github = options.githubService || githubService;
    this.gemini = options.geminiService || geminiService;
    this.fileFilter = options.fileFilter || defaultFileFilter;
    this.concurrency = options.concurrency || env.GEMINI_CONCURRENCY;
  }

  /**
   * Main analysis pipeline for a GitHub repository.
   *
   * @param {string} repositoryUrl
   * @param {object} [options]
   * @param {(tracker: ProgressTracker) => void} [options.onTrackerCreated]
   * @returns {Promise<object>}
   */
  async analyzeRepository(repositoryUrl, options = {}) {
    const startTime = Date.now();
    logger.info({ repositoryUrl }, 'Starting repository analysis');

    // 1. Validate & Parse URL
    const { owner, repo } = validateRepositoryUrl(repositoryUrl);

    // 2. Fetch repository metadata & default branch
    const repoDetails = await this.github.getRepositoryDetails(owner, repo);
    logger.info(
      { owner, repo, defaultBranch: repoDetails.defaultBranch, sizeKb: repoDetails.sizeKb },
      'Repository details discovered'
    );

    // 3. Fetch Git tree
    const treeResponse = await this.github.getRepositoryTree(owner, repo, repoDetails.defaultBranch);
    const treeEntries = treeResponse.tree || [];

    // Filter only blob items (files)
    const fileEntries = treeEntries.filter((item) => item.type === 'blob');
    const totalFiles = fileEntries.length;

    // 4. Large repository limits protection
    if (totalFiles > env.MAX_FILES) {
      const error = new Error(
        `Repository has ${totalFiles} files, which exceeds the maximum allowed limit of ${env.MAX_FILES} files.`
      );
      error.status = 400;
      error.code = 'REPOSITORY_TOO_LARGE';
      throw error;
    }

    const calculatedTotalBytes = fileEntries.reduce((acc, f) => acc + (f.size || 0), 0);
    if (calculatedTotalBytes > env.MAX_TOTAL_SIZE) {
      const error = new Error(
        `Repository size (${Math.round(calculatedTotalBytes / (1024 * 1024))} MB) exceeds the maximum allowed limit of ${Math.round(env.MAX_TOTAL_SIZE / (1024 * 1024))} MB.`
      );
      error.status = 400;
      error.code = 'REPOSITORY_TOO_LARGE';
      throw error;
    }

    // 5. Intelligent file filtering
    const eligibleFiles = [];
    const skippedFiles = [];

    for (const file of fileEntries) {
      const evaluation = this.fileFilter.evaluate(file);
      if (evaluation.eligible) {
        eligibleFiles.push({
          path: file.path,
          size: file.size,
          language: evaluation.language,
        });
      } else {
        skippedFiles.push({
          file: file.path,
          reason: evaluation.reason || SKIP_REASONS.UNSUPPORTED_FILE_TYPE,
        });
      }
    }

    logger.info(
      {
        totalFiles,
        eligibleCount: eligibleFiles.length,
        skippedCount: skippedFiles.length,
      },
      'File filtering completed'
    );

    // 6. Setup Progress Tracking & Concurrency
    const tracker = new ProgressTracker(eligibleFiles.length);
    if (options.onTrackerCreated) {
      options.onTrackerCreated(tracker);
    }

    const pool = new ConcurrencyPool(this.concurrency);
    const allProblems = [];
    const failedFiles = [];
    let analyzedCount = 0;

    const severityCounts = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };

    // 7. Controlled Concurrency Analysis with Fail-Safe Isolation
    logger.info(
      { eligibleFilesCount: eligibleFiles.length, concurrency: this.concurrency },
      'Analysis started'
    );

    await pool.map(
      eligibleFiles,
      async (fileItem) => {
        const filePath = fileItem.path;
        tracker.startFile(filePath);

        let content = null;
        try {
          // Download file content just in time
          content = await this.github.getFileContent(
            owner,
            repo,
            filePath,
            repoDetails.defaultBranch
          );

          // Content-level secret detection check
          if (containsSecrets(content)) {
            logger.warn({ filePath }, 'Secret or credential detected in file content; skipping');
            content = null; // Discard immediately
            skippedFiles.push({
              file: filePath,
              reason: SKIP_REASONS.SENSITIVE_CONTENT,
            });
            tracker.skipFile(filePath, SKIP_REASONS.SENSITIVE_CONTENT);
            return;
          }

          // Analyze with Gemini
          const analysis = await this.gemini.analyzeFile({
            filePath,
            language: fileItem.language,
            content,
          });

          // Discard source code from memory immediately
          content = null;

          // Annotate problems with file path and tally severities
          const fileProblems = (analysis.problems || []).map((problem) => {
            const sev = problem.severity;
            if (severityCounts[sev] !== undefined) {
              severityCounts[sev]++;
            } else {
              severityCounts.medium++;
            }

            return {
              file: filePath,
              ...problem,
            };
          });

          allProblems.push(...fileProblems);
          analyzedCount++;
          tracker.completeFile(filePath, fileProblems.length);
        } catch (error) {
          // Discard content if any
          content = null;

          const errorCode = error.code || (error.status === 429 ? 'GEMINI_RATE_LIMIT' : 'ANALYSIS_ERROR');
          logger.error(
            { filePath, error: error.message, code: errorCode },
            'Analysis failed for file (isolated)'
          );

          failedFiles.push({
            file: filePath,
            error: errorCode,
          });
          tracker.failFile(filePath, error.message);
        }
      }
    );

    const durationMs = Date.now() - startTime;
    logger.info(
      {
        owner,
        repo,
        durationMs,
        analyzedFiles: analyzedCount,
        problemsFound: allProblems.length,
        failedFilesCount: failedFiles.length,
      },
      'Repository analysis completed'
    );

    // 8. Assemble structured response
    return {
      repository: {
        owner,
        name: repo,
      },
      summary: {
        totalFiles,
        analyzedFiles: analyzedCount,
        skippedFiles: skippedFiles.length,
        problems: allProblems.length,
        critical: severityCounts.critical,
        high: severityCounts.high,
        medium: severityCounts.medium,
        low: severityCounts.low,
      },
      problems: allProblems,
      skippedFiles,
      failedFiles,
    };
  }
}

export const analyzerService = new AnalyzerService();
