import { describe, it, expect } from 'vitest';
import { ConcurrencyPool } from '../src/services/concurrency.service.js';

describe('ConcurrencyPool', () => {
  it('strictly limits active tasks to the configured concurrency limit', async () => {
    const concurrency = 5;
    const pool = new ConcurrencyPool(concurrency);
    const totalTasks = 20;

    let currentActive = 0;
    let maxObservedActive = 0;

    const items = Array.from({ length: totalTasks }, (_, i) => i);

    await pool.map(items, async (item) => {
      currentActive++;
      if (currentActive > maxObservedActive) {
        maxObservedActive = currentActive;
      }

      // Simulate variable asynchronous execution time
      const delay = 10 + (item % 5) * 5;
      await new Promise((resolve) => setTimeout(resolve, delay));

      currentActive--;
      return item * 2;
    });

    expect(maxObservedActive).toBeLessThanOrEqual(concurrency);
    expect(maxObservedActive).toBe(concurrency);
    expect(currentActive).toBe(0);
  });

  it('immediately starts the next queued task when one task finishes', async () => {
    const pool = new ConcurrencyPool(2);
    const executionOrder = [];

    const p1 = pool.run(async () => {
      executionOrder.push('start-1');
      await new Promise((r) => setTimeout(r, 40));
      executionOrder.push('end-1');
    });

    const p2 = pool.run(async () => {
      executionOrder.push('start-2');
      await new Promise((r) => setTimeout(r, 20));
      executionOrder.push('end-2');
    });

    const p3 = pool.run(async () => {
      executionOrder.push('start-3');
      await new Promise((r) => setTimeout(r, 10));
      executionOrder.push('end-3');
    });

    await Promise.all([p1, p2, p3]);

    // Task 2 finishes first at 20ms, so Task 3 should start before Task 1 ends (at 40ms)
    expect(executionOrder.indexOf('start-3')).toBeGreaterThan(executionOrder.indexOf('end-2'));
    expect(executionOrder.indexOf('start-3')).toBeLessThan(executionOrder.indexOf('end-1'));
  });
});
