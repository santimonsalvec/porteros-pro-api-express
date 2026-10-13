import type { IClock } from '../../../../common/clock.js';
import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { IJobLockReader } from '../../common/adminPorts.js';
import type { IScheduledJob } from '../../common/ports.js';
import { GetSystemJobsQuery, type SystemJobsResult } from './getSystemJobsQuery.js';

/** The sweep runs every minute: five without a start means it stopped. */
const LATE_AFTER_MINUTES = 5;

export interface SystemJobsDependencies {
  /** The very list the sweep runs, so a new job shows up here on its own (research §8). */
  jobs: readonly Pick<IScheduledJob, 'name' | 'leaseSeconds'>[];
  locks: IJobLockReader;
  clock: IClock;
}

/** When each job last started, from its lease; whether a run failed is not kept (Clarifications). */
export class GetSystemJobsQueryHandler implements IQueryHandler<GetSystemJobsQuery, SystemJobsResult> {
  constructor(private readonly deps: SystemJobsDependencies) {}

  async handle(_query: GetSystemJobsQuery): Promise<SystemJobsResult> {
    const now = this.deps.clock.now();
    const leases = await this.deps.locks.list(this.deps.jobs.map((job) => job.name));
    const lateBefore = now.getTime() - LATE_AFTER_MINUTES * 60_000;
    const jobs = this.deps.jobs.map((job) => {
      const lease = leases.get(job.name);
      const running = lease !== undefined && lease.lockedUntil > now;
      return {
        name: job.name,
        leaseSeconds: job.leaseSeconds,
        lastStartedAt: lease?.lockedAt ?? null,
        running,
        leaseUntil: running ? lease.lockedUntil : null,
        late: !lease || lease.lockedAt.getTime() < lateBefore,
      };
    });
    return { checkedAt: now, lateAfterMinutes: LATE_AFTER_MINUTES, sweepLate: jobs.length > 0 && jobs.every((job) => job.late), jobs };
  }
}
