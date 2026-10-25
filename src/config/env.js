import dotenv from 'dotenv';

dotenv.config();

function parseInteger(value, fallback, name) {
  if (value === undefined || value === '') {
    return fallback;
  }
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid integer configuration for ${name}: "${value}"`);
  }
  return parsed;
}

export const env = Object.freeze({
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInteger(process.env.PORT, 3000, 'PORT'),

  // GitHub configuration
  GITHUB_TOKEN: process.env.GITHUB_TOKEN ? process.env.GITHUB_TOKEN.trim() : null,

  // Gemini configuration
  GEMINI_API_KEY: process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.trim() : null,
  GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  GEMINI_CONCURRENCY: parseInteger(process.env.GEMINI_CONCURRENCY, 5, 'GEMINI_CONCURRENCY'),
  GEMINI_MAX_RETRIES: parseInteger(process.env.GEMINI_MAX_RETRIES, 3, 'GEMINI_MAX_RETRIES'),
  GEMINI_RETRY_BASE_DELAY_MS: parseInteger(
    process.env.GEMINI_RETRY_BASE_DELAY_MS,
    1000,
    'GEMINI_RETRY_BASE_DELAY_MS'
  ),

  // Repository-level & file-level limits
  MAX_FILES: parseInteger(process.env.MAX_FILES, 1000, 'MAX_FILES'),
  MAX_FILE_SIZE: parseInteger(process.env.MAX_FILE_SIZE, 1024 * 1024, 'MAX_FILE_SIZE'), // 1 MB
  MAX_TOTAL_SIZE: parseInteger(process.env.MAX_TOTAL_SIZE, 100 * 1024 * 1024, 'MAX_TOTAL_SIZE'), // 100 MB
  REQUEST_TIMEOUT_MS: parseInteger(process.env.REQUEST_TIMEOUT_MS, 60000, 'REQUEST_TIMEOUT_MS'),

  // Rate Limiter
  RATE_LIMIT_WINDOW_MS: parseInteger(
    process.env.RATE_LIMIT_WINDOW_MS,
    15 * 60 * 1000,
    'RATE_LIMIT_WINDOW_MS'
  ),
  RATE_LIMIT_MAX_REQUESTS: parseInteger(
    process.env.RATE_LIMIT_MAX_REQUESTS,
    100,
    'RATE_LIMIT_MAX_REQUESTS'
  ),
});

/**
 * Validates mandatory environment variables when starting the server in production.
 */
export function validateEnv() {
  const missing = [];
  if (env.NODE_ENV === 'production') {
    if (!env.GEMINI_API_KEY) {
      missing.push('GEMINI_API_KEY');
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}
