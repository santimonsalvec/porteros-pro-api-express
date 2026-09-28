import { ICommand } from '../../../../common/mediator/types.js';

export interface SweepJobReport {
  name: string;
  outcome: 'succeeded' | 'failed' | 'skipped';
  detail?: string;
}

/** What one sweep did (FR-022). */
export interface SweepReport {
  published: number;
  stillPending: number;
  oldestPendingSeconds: number | null;
  jobs: SweepJobReport[];
}

/** Runs every minute: publishes pending events, then the scheduled jobs (feature 013). */
export class RunSweepCommand extends ICommand<SweepReport> {}
