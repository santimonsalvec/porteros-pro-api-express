import type { IClock } from '../../../../common/clock.js';
import type { ICommandHandler } from '../../../../common/mediator/types.js';
import type { IEventLogger, IEventPublisher, IJobLockStore, IOutboxStore, IScheduledJob } from '../../common/ports.js';
import { RunSweepCommand, type SweepJobReport, type SweepReport } from './runSweepCommand.js';

/** How long a sweep holds the events it claimed before another sweep may retry them. */
const EVENT_LEASE_SECONDS = 60;
const PUBLISH_CHUNK = 100;

export interface RunSweepDependencies {
  outbox: IOutboxStore;
  publisher: IEventPublisher;
  clock: IClock;
  logger: IEventLogger;
  batchLimit: number;
  pendingWarningMinutes: number;
  /** Registered by later features (expirations, offer re-sends…); empty in 013. */
  jobs: readonly IScheduledJob[];
  jobLocks: IJobLockStore;
}

/**
 * The every-minute safety net (research §11). Events are claimed with leases, so overlapping
 * sweeps never publish the same one; a failed publication leaves them pending for a later sweep.
 */
export class RunSweepCommandHandler implements ICommandHandler<RunSweepCommand, SweepReport> {
  constructor(private readonly deps: RunSweepDependencies) {}

  async handle(_command: RunSweepCommand): Promise<SweepReport> {
    const now = this.deps.clock.now();
    const published = await this.publishPending(now);
    const stats = await this.deps.outbox.pendingStats(now);
    const oldestPendingSeconds = stats.oldestCreatedAt
      ? Math.floor((now.getTime() - stats.oldestCreatedAt.getTime()) / 1000)
      : null;
    if (oldestPendingSeconds !== null && oldestPendingSeconds > this.deps.pendingWarningMinutes * 60) {
      this.deps.logger.warn(
        { outcome: 'events_pending_too_long', count: stats.count, oldestPendingSeconds },
        'Domain events have been pending too long',
      );
    }
    const jobs = await this.runJobs(now);
    return { published, stillPending: stats.count, oldestPendingSeconds, jobs };
  }

  private async publishPending(now: Date): Promise<number> {
    let published = 0;
    try {
      const claimed = await this.deps.outbox.claimNext(now, EVENT_LEASE_SECONDS, this.deps.batchLimit);
      for (let start = 0; start < claimed.length; start += PUBLISH_CHUNK) {
        const chunk = claimed.slice(start, start + PUBLISH_CHUNK);
        try {
          await this.deps.publisher.publish(chunk);
          await this.deps.outbox.markPublished(
            chunk.map((event) => event.id),
            this.deps.clock.now(),
          );
          published += chunk.length;
        } catch (err) {
          this.deps.logger.warn(
            { outcome: 'event_publish_failed', eventIds: chunk.map((event) => event.id), err },
            'Sweep could not publish events',
          );
        }
      }
    } catch (err) {
      this.deps.logger.warn({ outcome: 'event_claim_failed', err }, 'Sweep could not claim pending events');
    }
    return published;
  }

  /**
   * Each job under its own lease and its own try/catch (FR-020, FR-021): a held lease skips it, a
   * failure is reported and logged without touching the other jobs.
   */
  private async runJobs(now: Date): Promise<SweepJobReport[]> {
    const reports: SweepJobReport[] = [];
    for (const job of this.deps.jobs) {
      let acquired = false;
      try {
        acquired = await this.deps.jobLocks.tryAcquire(job.name, now, job.leaseSeconds);
        if (!acquired) {
          reports.push({ name: job.name, outcome: 'skipped', detail: 'another sweep is running it' });
          continue;
        }
        const detail = await job.run(now);
        reports.push({ name: job.name, outcome: 'succeeded', ...(detail ? { detail } : {}) });
      } catch (err) {
        this.deps.logger.warn({ outcome: 'scheduled_job_failed', job: job.name, err }, 'Scheduled job failed');
        reports.push({ name: job.name, outcome: 'failed', detail: err instanceof Error ? err.message : String(err) });
      } finally {
        if (acquired) await this.deps.jobLocks.release(job.name, this.deps.clock.now()).catch(() => undefined);
      }
    }
    return reports;
  }
}
