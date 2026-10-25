import { describe, it, expect, vi } from 'vitest';
import { withRetry } from '../src/utils/retry.js';

describe('withRetry Utility', () => {
  it('returns immediately without retry on successful response', async () => {
    const fn = vi.fn().mockResolvedValue('success');

    const result = await withRetry(fn, {
      maxRetries: 3,
      baseDelayMs: 10,
    });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on 429 rate limit error until success', async () => {
    const rateLimitError = new Error('Rate limit exceeded');
    rateLimitError.status = 429;

    const fn = vi
      .fn()
      .mockRejectedValueOnce(rateLimitError)
      .mockRejectedValueOnce(rateLimitError)
      .mockResolvedValue('recovered');

    const result = await withRetry(fn, {
      maxRetries: 3,
      baseDelayMs: 5,
    });

    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('retries on transient network errors (e.g. ECONNRESET)', async () => {
    const networkError = new Error('read ECONNRESET');
    networkError.code = 'ECONNRESET';

    const fn = vi
      .fn()
      .mockRejectedValueOnce(networkError)
      .mockResolvedValue('ok');

    const result = await withRetry(fn, {
      maxRetries: 2,
      baseDelayMs: 5,
    });

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('fails after maximum retries are exhausted', async () => {
    const serverError = new Error('Internal Server Error');
    serverError.status = 503;

    const fn = vi.fn().mockRejectedValue(serverError);

    await expect(
      withRetry(fn, {
        maxRetries: 2,
        baseDelayMs: 5,
      })
    ).rejects.toThrow('Internal Server Error');

    // 1 initial call + 2 retries = 3 calls
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does NOT retry on non-transient 400 Bad Request error', async () => {
    const badRequest = new Error('Bad Request: Invalid parameter');
    badRequest.status = 400;

    const fn = vi.fn().mockRejectedValue(badRequest);

    await expect(
      withRetry(fn, {
        maxRetries: 3,
        baseDelayMs: 5,
      })
    ).rejects.toThrow('Bad Request');

    expect(fn).toHaveBeenCalledTimes(1);
  });
});
