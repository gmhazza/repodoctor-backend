import { logger } from './logger.js';

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Calculates exponential backoff delay with full jitter.
 * delay = (baseDelay * 2^attempt) + random_jitter
 */
export function calculateBackoff(attempt, baseDelayMs = 1000, maxDelayMs = 15000) {
  const exponential = baseDelayMs * Math.pow(2, attempt);
  const capped = Math.min(exponential, maxDelayMs);
  // Full jitter: random between 0 and capped
  const jitter = Math.random() * (capped * 0.3);
  return Math.floor(capped + jitter);
}

/**
 * Evaluates whether an error is transient and safe to retry.
 */
export function isTransientError(error) {
  if (!error) return false;

  // HTTP status codes
  const status = error.status || error.statusCode || error.response?.status;
  if (status) {
    if (status === 429) return true; // Rate limit
    if (status >= 500 && status <= 504) return true; // Server errors
    return false; // Other 4xx errors should not be retried
  }

  // Node.js network error codes
  const code = error.code;
  if (
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNREFUSED' ||
    code === 'EAI_AGAIN' ||
    code === 'ENOTFOUND' ||
    code === 'UND_ERR_CONNECT_TIMEOUT'
  ) {
    return true;
  }

  // Fetch / network error messages
  const message = error.message || '';
  if (
    message.includes('fetch failed') ||
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('429') ||
    message.includes('RESOURCE_EXHAUSTED') ||
    message.includes('rate limit')
  ) {
    return true;
  }

  return false;
}

/**
 * Executes an asynchronous function with exponential backoff and jitter.
 *
 * @template T
 * @param {() => Promise<T>} fn - The async task to run
 * @param {object} options
 * @param {number} [options.maxRetries=3] - Maximum retry attempts
 * @param {number} [options.baseDelayMs=1000] - Base delay in ms
 * @param {number} [options.maxDelayMs=15000] - Cap on delay in ms
 * @param {(err: any) => boolean} [options.isRetryable=isTransientError]
 * @param {string} [options.operationName='operation']
 * @returns {Promise<T>}
 */
export async function withRetry(fn, options = {}) {
  const {
    maxRetries = 3,
    baseDelayMs = 1000,
    maxDelayMs = 15000,
    isRetryable = isTransientError,
    operationName = 'operation',
  } = options;

  let attempt = 0;

  while (true) {
    try {
      return await fn();
    } catch (error) {
      attempt++;

      const retryable = isRetryable(error);
      if (!retryable || attempt > maxRetries) {
        if (!retryable) {
          logger.debug({ operation: operationName, error: error.message }, 'Error is non-retryable');
        } else {
          logger.warn(
            { operation: operationName, attempt, maxRetries, error: error.message },
            'Max retries exceeded'
          );
        }
        throw error;
      }

      const delay = calculateBackoff(attempt - 1, baseDelayMs, maxDelayMs);
      logger.warn(
        {
          operation: operationName,
          attempt,
          maxRetries,
          delayMs: delay,
          status: error.status || error.statusCode,
          error: error.message,
        },
        'Transient error encountered, retrying after backoff'
      );

      await sleep(delay);
    }
  }
}
