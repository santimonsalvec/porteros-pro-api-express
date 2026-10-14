import { afterEach, describe, expect, it, vi } from 'vitest';
import { realResponseTimer, withResponseFloor } from '../../../../../src/application/features/staff/common/responseFloor.js';

afterEach(() => vi.useRealTimers());

describe('withResponseFloor (admin spec 009, research §7)', () => {
  it('waits what is left of the floor with the real timer', async () => {
    vi.useFakeTimers();
    let settled = false;
    const answer = withResponseFloor(realResponseTimer, 800, async () => 'sent').then((value) => ((settled = true), value));

    await vi.advanceTimersByTimeAsync(799);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    expect(await answer).toBe('sent');
  });

  it('also waits when the work fails, and passes the failure on', async () => {
    const sleep = vi.fn(async () => undefined);
    const failing = withResponseFloor({ stopwatch: () => () => 100, sleep }, 800, async () => {
      throw new Error('provider down');
    });

    await expect(failing).rejects.toThrow('provider down');
    expect(sleep).toHaveBeenCalledWith(700);
  });

  it('does not wait once the floor has passed', async () => {
    const sleep = vi.fn(async () => undefined);

    await withResponseFloor({ stopwatch: () => () => 900, sleep }, 800, async () => 'sent');

    expect(sleep).not.toHaveBeenCalled();
  });
});
