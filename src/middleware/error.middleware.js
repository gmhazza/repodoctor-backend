import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

/**
 * 404 Handler for undefined routes
 */
export function notFoundHandler(req, res) {
  res.status(404).json({
    error: {
      message: `Endpoint ${req.method} ${req.originalUrl} not found.`,
      code: 'ROUTE_NOT_FOUND',
      status: 404,
    },
  });
}

/**
 * Centralized Global Error Handler
 */
export function errorHandler(err, req, res, _next) {
  const status = err.status || err.statusCode || 500;
  const code = err.code || (status >= 500 ? 'INTERNAL_SERVER_ERROR' : 'BAD_REQUEST');

  logger.error(
    {
      method: req.method,
      url: req.originalUrl,
      status,
      code,
      message: err.message,
      ...(env.NODE_ENV === 'development' ? { stack: err.stack } : {}),
    },
    'Request error handled'
  );

  res.status(status).json({
    error: {
      message: err.message || 'An unexpected internal error occurred.',
      code,
      status,
      ...(env.NODE_ENV === 'development' ? { stack: err.stack } : {}),
    },
  });
}
