import { IQuery } from '../../../../common/mediator/types.js';
import type { Page } from '../../../geography/common/views.js';
import type { PendingEventRecord } from '../../common/adminPorts.js';

export interface PendingEventView extends PendingEventRecord {
  /** The sweep tried to publish it more than once. */
  retried: boolean;
  /** Pending for longer than `stuckAfterMinutes`. */
  stuck: boolean;
}

export interface SystemEventsResult {
  checkedAt: Date;
  stuckAfterMinutes: number;
  /** Every pending event, whatever the page shows. */
  pending: { count: number; oldestCreatedAt: Date | null; oldestPendingSeconds: number | null; retriedCount: number };
  page: Page<PendingEventView>;
}

/** The outbox's pending events for Sistema (contracts/dashboard-system-api.md §3). */
export class GetSystemEventsQuery extends IQuery<SystemEventsResult> {
  constructor(readonly criteria: { retried: boolean; page: number; pageSize: number }) {
    super();
  }
}
