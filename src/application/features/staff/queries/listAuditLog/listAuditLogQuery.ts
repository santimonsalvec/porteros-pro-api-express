import { IQuery } from '../../../../common/mediator/types.js';
import type { AuditOutcome } from '../../../../../domain/staff/auditEntry.js';
import type { AuditEntrySummary } from '../../common/auditViews.js';

export interface AuditLogFilters {
  staffId?: string;
  resourceType?: string;
  action?: string;
  outcome?: AuditOutcome;
  from?: Date;
  to?: Date;
}

export type ListAuditLogResult =
  | { outcome: 'ok'; items: AuditEntrySummary[]; nextCursor: string | null }
  | { outcome: 'invalid_cursor' | 'invalid_range' };

/** The audit log, newest first, one cursor page at a time (spec 002, US4). */
export class ListAuditLogQuery extends IQuery<ListAuditLogResult> {
  constructor(
    readonly filters: AuditLogFilters,
    readonly cursor: string | null,
    readonly limit: number,
  ) {
    super();
  }
}
