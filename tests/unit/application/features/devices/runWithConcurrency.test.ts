import { describe, expect, it } from 'vitest';
import { runWithConcurrency } from '../../../../../src/application/features/devices/common/runWithConcurrency.js';

describe('runWithConcurrency', () => {
  it('never runs more than the limit at once and keeps the input order', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const results = await runWithConcurrency([30, 5, 20, 1, 10, 2], 2, async (ms, index) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, ms));
      inFlight -= 1;
      return index;
    });

    expect(maxInFlight).toBe(2);
    expect(results).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('handles an empty input', async () => {
    expect(await runWithConcurrency([], 10, async () => 1)).toEqual([]);
  });
});
