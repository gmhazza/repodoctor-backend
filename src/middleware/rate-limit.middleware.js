import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

export const apiRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true, // Return standard RateLimit-* headers
  legacyHeaders: false, // Disable X-RateLimit-* headers
  message: {
    error: {
      message: 'Too many requests from this IP, please try again later.',
      code: 'API_RATE_LIMIT_EXCEEDED',
      status: 429,
    },
  },
});
