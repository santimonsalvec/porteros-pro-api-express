import type { IClock } from '../../../../common/clock.js';
import type { IQueryHandler } from '../../../../common/mediator/types.js';
import { pageOf } from '../../../geography/common/views.js';
import type { IOutboxAdminReader } from '../../common/adminPorts.js';
import type { IOutboxStore } from '../../common/ports.js';
import { GetSystemEventsQuery, type SystemEventsResult } from './getSystemEventsQuery.js';

export interface SystemEventsDependencies {
  outbox: IOutboxAdminReader;
  /** The sweep's own count of what is pending (feature 013). */
  stats: Pick<IOutboxStore, 'pendingStats'>;
  clock: IClock;
  /** The threshold of the `events_pending_too_long` warning. */
  stuckAfterMinutes: number;
}

/** What the outbox holds back (research §7): the consumers' failures are not here (Clarifications). */
export class GetSystemEventsQueryHandler implements IQueryHandler<GetSystemEventsQuery, SystemEventsResult> {
  constructor(private readonly deps: SystemEventsDependencies) {}

  async handle({ criteria }: GetSystemEventsQuery): Promise<SystemEventsResult> {
    const now = this.deps.clock.now();
    const [stats, retriedCount, found] = await Promise.all([
      this.deps.stats.pendingStats(now),
      this.deps.outbox.retriedCount(),
      this.deps.outbox.listPending({ retried: criteria.retried }, criteria.page, criteria.pageSize),
    ]);
    const stuckBefore = now.getTime() - this.deps.stuckAfterMinutes * 60_000;
    const items = found.items.map((item) => ({ ...item, retried: item.attempts >= 2, stuck: item.createdAt.getTime() < stuckBefore }));
    return {
      checkedAt: now,
      stuckAfterMinutes: this.deps.stuckAfterMinutes,
      pending: {
        count: stats.count,
        oldestCreatedAt: stats.oldestCreatedAt,
        oldestPendingSeconds: stats.oldestCreatedAt ? Math.floor((now.getTime() - stats.oldestCreatedAt.getTime()) / 1000) : null,
        retriedCount,
      },
      page: pageOf(items, criteria.page, criteria.pageSize, found.totalItems),
    };
  }
}
