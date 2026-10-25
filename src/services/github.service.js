import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { withRetry } from '../utils/retry.js';

export class GitHubService {
  constructor(token = env.GITHUB_TOKEN) {
    this.token = token;
    this.baseUrl = 'https://api.github.com';
    this.rawBaseUrl = 'https://raw.githubusercontent.com';
  }

  /**
   * Helper to construct GitHub headers with token and User-Agent.
   * @param {Record<string, string>} [customHeaders]
   * @returns {Record<string, string>}
   */
  getHeaders(customHeaders = {}) {
    const headers = {
      'User-Agent': 'repo-doctor-backend/1.0.0',
      Accept: 'application/vnd.github.v3+json',
      ...customHeaders,
    };

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    return headers;
  }

  /**
   * Fetches repository details including default branch and size.
   *
   * @param {string} owner
   * @param {string} repo
   * @returns {Promise<{ owner: string, name: string, defaultBranch: string, isPrivate: boolean, sizeKb: number }>}
   */
  async getRepositoryDetails(owner, repo) {
    const url = `${this.baseUrl}/repos/${owner}/${repo}`;
    logger.debug({ owner, repo }, 'Fetching GitHub repository details');

    return withRetry(
      async () => {
        const response = await fetch(url, {
          headers: this.getHeaders(),
          signal: AbortSignal.timeout(env.REQUEST_TIMEOUT_MS),
        });

        if (!response.ok) {
          await this.handleHttpError(response, `fetching repository "${owner}/${repo}"`);
        }

        const data = await response.json();
        return {
          owner: data.owner?.login || owner,
          name: data.name || repo,
          defaultBranch: data.default_branch || 'main',
          isPrivate: !!data.private,
          sizeKb: data.size || 0,
        };
      },
      {
        operationName: `GitHub:getRepositoryDetails(${owner}/${repo})`,
        maxRetries: 2,
      }
    );
  }

  /**
   * Retrieves the full repository tree recursively using the Git Trees API.
   *
   * @param {string} owner
   * @param {string} repo
   * @param {string} branch
   * @returns {Promise<{ tree: Array<{ path: string, mode: string, type: string, size?: number, sha: string }>, truncated: boolean }>}
   */
  async getRepositoryTree(owner, repo, branch) {
    const url = `${this.baseUrl}/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
    logger.debug({ owner, repo, branch }, 'Fetching GitHub repository tree');

    return withRetry(
      async () => {
        const response = await fetch(url, {
          headers: this.getHeaders(),
          signal: AbortSignal.timeout(env.REQUEST_TIMEOUT_MS),
        });

        if (!response.ok) {
          await this.handleHttpError(response, `fetching repository tree for "${owner}/${repo}"`);
        }

        const data = await response.json();

        if (data.truncated) {
          logger.warn(
            { owner, repo, branch },
            'Repository tree is truncated by GitHub (exceeded 100,000 files / 7MB limit)'
          );
        }

        return {
          tree: data.tree || [],
          truncated: !!data.truncated,
        };
      },
      {
        operationName: `GitHub:getRepositoryTree(${owner}/${repo})`,
        maxRetries: 2,
      }
    );
  }

  /**
   * Fetches raw content of a single file.
   *
   * @param {string} owner
   * @param {string} repo
   * @param {string} filePath
   * @param {string} branch
   * @returns {Promise<string>}
   */
  async getFileContent(owner, repo, filePath, branch) {
    // We use the contents API with Accept: application/vnd.github.raw to get raw text
    const encodedPath = filePath
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');
    const url = `${this.baseUrl}/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`;

    return withRetry(
      async () => {
        const response = await fetch(url, {
          headers: this.getHeaders({
            Accept: 'application/vnd.github.raw',
          }),
          signal: AbortSignal.timeout(env.REQUEST_TIMEOUT_MS),
        });

        if (!response.ok) {
          await this.handleHttpError(response, `fetching file content for "${filePath}"`);
        }

        return await response.text();
      },
      {
        operationName: `GitHub:getFileContent(${filePath})`,
        maxRetries: 2,
      }
    );
  }

  /**
   * Translates non-OK HTTP responses into structured informative errors.
   */
  async handleHttpError(response, context) {
    const status = response.status;
    let errorMessage = `GitHub API error (${status}) while ${context}`;

    try {
      const errorJson = await response.json();
      if (errorJson.message) {
        errorMessage += `: ${errorJson.message}`;
      }
    } catch {
      // Ignore if body is not JSON
    }

    const error = new Error(errorMessage);
    error.status = status;

    if (status === 404) {
      error.code = 'REPOSITORY_NOT_FOUND';
      error.message = `GitHub repository or resource not found or private while ${context}.`;
    } else if (status === 403 || status === 429) {
      const remaining = response.headers.get('x-ratelimit-remaining');
      if (remaining === '0') {
        error.code = 'GITHUB_RATE_LIMIT_EXCEEDED';
        error.message =
          'GitHub API rate limit exceeded. Please provide a GITHUB_TOKEN environment variable.';
      } else {
        error.code = 'GITHUB_FORBIDDEN';
      }
    } else if (status === 409) {
      error.code = 'REPOSITORY_EMPTY';
      error.message = 'The repository appears to be empty or has no commits.';
    }

    throw error;
  }
}

export const githubService = new GitHubService();
