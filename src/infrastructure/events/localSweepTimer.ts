import type { ISender } from '../../application/common/mediator/types.js';
import { RunSweepCommand } from '../../application/features/events/commands/runSweep/runSweepCommand.js';
import type { IEventLogger } from '../../application/features/events/common/ports.js';

/**
 * Local mode's stand-in for Cloud Scheduler (research §8): sends the sweep every minute in-process.
 * It never keeps the process alive on its own, and a failing sweep is logged, not thrown.
 */
export function startLocalSweepTimer(sender: ISender, logger: IEventLogger, intervalMs = 60_000): { stop: () => void } {
  const timer = setInterval(() => {
    sender.send(new RunSweepCommand()).catch((err: unknown) => {
      logger.warn({ outcome: 'local_sweep_failed', err }, 'Local sweep failed');
    });
  }, intervalMs);
  timer.unref();
  return { stop: () => clearInterval(timer) };
}
