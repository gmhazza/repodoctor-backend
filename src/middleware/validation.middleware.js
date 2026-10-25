import { validateRepositoryUrl } from '../utils/validation.js';

/**
 * Middleware to validate incoming /api/analyze request payload.
 */
export function validateAnalyzeRequest(req, res, next) {
  const { repository } = req.body || {};

  if (!repository) {
    return res.status(400).json({
      error: {
        message: 'The "repository" field is required in the request body.',
        code: 'MISSING_REPOSITORY',
        status: 400,
      },
    });
  }

  try {
    const parsed = validateRepositoryUrl(repository);
    req.repositoryInfo = parsed;
    next();
  } catch (err) {
    return res.status(400).json({
      error: {
        message: err.message,
        code: err.code || 'INVALID_REPOSITORY_URL',
        status: 400,
      },
    });
  }
}
