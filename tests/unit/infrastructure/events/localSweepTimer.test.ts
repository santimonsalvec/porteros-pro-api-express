import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ISender } from '../../../../src/application/common/mediator/types.js';
import { RunSweepCommand } from '../../../../src/application/features/events/commands/runSweep/runSweepCommand.js';
import { startLocalSweepTimer } from '../../../../src/infrastructure/events/localSweepTimer.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('startLocalSweepTimer — US6: local mode sweeps without Cloud Scheduler', () => {
  it('sends the sweep every interval until stopped', async () => {
    vi.useFakeTimers();
    const send = vi.fn(async (_command: unknown) => ({}));
    const timer = startLocalSweepTimer({ send } as unknown as ISender, { info: vi.fn(), warn: vi.fn() }, 60_000);

    await vi.advanceTimersByTimeAsync(180_000);
    timer.stop();
    await vi.advanceTimersByTimeAsync(120_000);

    expect(send).toHaveBeenCalledTimes(3);
    expect(send.mock.calls[0]![0]).toBeInstanceOf(RunSweepCommand);
  });

  it('logs a failing sweep instead of throwing', async () => {
    vi.useFakeTimers();
    const warn = vi.fn();
    const timer = startLocalSweepTimer({ send: vi.fn(async () => Promise.reject(new Error('db down'))) } as unknown as ISender, { info: vi.fn(), warn }, 1000);

    await vi.advanceTimersByTimeAsync(1000);
    timer.stop();

    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'local_sweep_failed' }), expect.any(String));
  });
});
