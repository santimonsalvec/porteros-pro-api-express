import { IQuery } from '../../../../common/mediator/types.js';

export interface ScheduledJobStatus {
  name: string;
  leaseSeconds: number;
  /** When a sweep last took it; `null` = never. */
  lastStartedAt: Date | null;
  running: boolean;
  leaseUntil: Date | null;
  /** Not started in the last `lateAfterMinutes`, or never. */
  late: boolean;
}

export interface SystemJobsResult {
  checkedAt: Date;
  lateAfterMinutes: number;
  /** Every job is late: the sweep itself does not run. */
  sweepLate: boolean;
  jobs: ScheduledJobStatus[];
}

/** The sweep's jobs for Sistema (contracts/dashboard-system-api.md §4). */
export class GetSystemJobsQuery extends IQuery<SystemJobsResult> {}
