import { env } from '../config/env.js';

/**
 * High-performance Semaphore / Worker Pool for controlling concurrency.
 * Ensures that at most N operations run concurrently.
 * As soon as any running operation finishes, the next queued operation immediately begins.
 */
export class ConcurrencyPool {
  /**
   * @param {number} [concurrency]
   */
  constructor(concurrency = env.GEMINI_CONCURRENCY) {
    if (!concurrency || concurrency < 1) {
      throw new Error(`Concurrency must be at least 1, received: ${concurrency}`);
    }
    this.concurrency = concurrency;
    this.activeCount = 0;
    this.queue = [];
  }

  /**
   * Executes a task function when a concurrency slot is available.
   *
   * @template T
   * @param {() => Promise<T>} task
   * @returns {Promise<T>}
   */
  async run(task) {
    if (this.activeCount >= this.concurrency) {
      await new Promise((resolve) => this.queue.push(resolve));
    }

    this.activeCount++;
    try {
      return await task();
    } finally {
      this.activeCount--;
      if (this.queue.length > 0) {
        const next = this.queue.shift();
        next();
      }
    }
  }

  /**
   * Processes an array of items through an async worker function with controlled concurrency.
   *
   * @template T, R
   * @param {T[]} items
   * @param {(item: T, index: number) => Promise<R>} worker
   * @param {object} [options]
   * @param {(result: R, item: T, index: number) => void} [options.onItemCompleted]
   * @param {(error: Error, item: T, index: number) => void} [options.onItemError]
   * @returns {Promise<R[]>}
   */
  async map(items, worker, options = {}) {
    if (!Array.isArray(items) || items.length === 0) {
      return [];
    }

    const { onItemCompleted, onItemError } = options;
    const results = new Array(items.length);

    const promises = items.map((item, index) =>
      this.run(async () => {
        try {
          const res = await worker(item, index);
          results[index] = res;
          if (onItemCompleted) {
            onItemCompleted(res, item, index);
          }
          return res;
        } catch (err) {
          if (onItemError) {
            onItemError(err, item, index);
          }
          throw err;
        }
      })
    );

    await Promise.allSettled(promises);
    return results;
  }

  get stats() {
    return {
      active: this.activeCount,
      queued: this.queue.length,
      concurrency: this.concurrency,
    };
  }
}
