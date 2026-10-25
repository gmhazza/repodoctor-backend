const GITHUB_REPO_REGEX =
  /^(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+?)(?:\.git)?(?:\/.*)?$/;

/**
 * Validates a GitHub repository URL and extracts owner and repository name.
 *
 * @param {string} url
 * @returns {{ owner: string, repo: string } | null}
 */
export function parseGitHubUrl(url) {
  if (!url || typeof url !== 'string') {
    return null;
  }

  const trimmed = url.trim();
  const match = trimmed.match(GITHUB_REPO_REGEX);

  if (!match) {
    return null;
  }

  const owner = match[1];
  let repo = match[2];

  // Strip trailing slash or .git if present
  if (repo.endsWith('.git')) {
    repo = repo.slice(0, -4);
  }

  // Prevent path traversal or reserved names
  if (owner === '.' || owner === '..' || repo === '.' || repo === '..') {
    return null;
  }

  if (!owner || !repo) {
    return null;
  }

  return { owner, repo };
}

/**
 * Validates repository URL and throws an error with a clear message if invalid.
 *
 * @param {string} url
 * @returns {{ owner: string, repo: string }}
 */
export function validateRepositoryUrl(url) {
  if (!url || typeof url !== 'string' || url.trim() === '') {
    const error = new Error('Field "repository" is required and must be a non-empty string.');
    error.status = 400;
    error.code = 'INVALID_INPUT';
    throw error;
  }

  const parsed = parseGitHubUrl(url);
  if (!parsed) {
    const error = new Error(
      `Invalid GitHub repository URL: "${url}". Expected format: "https://github.com/owner/repository"`
    );
    error.status = 400;
    error.code = 'INVALID_REPOSITORY_URL';
    throw error;
  }

  return parsed;
}
