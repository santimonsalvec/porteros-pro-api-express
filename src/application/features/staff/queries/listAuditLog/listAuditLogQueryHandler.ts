import type { IQueryHandler } from '../../../../common/mediator/types.js';
import { decodeAuditCursor, encodeAuditCursor } from '../../common/auditCursor.js';
import { toAuditSummary } from '../../common/auditViews.js';
import type { IAdminAuditLogReader } from '../../common/ports.js';
import { ListAuditLogQuery, type ListAuditLogResult } from './listAuditLogQuery.js';

export interface AuditQueryDependencies {
  auditLog: IAdminAuditLogReader;
}

export class ListAuditLogQueryHandler implements IQueryHandler<ListAuditLogQuery, ListAuditLogResult> {
  constructor(private readonly deps: AuditQueryDependencies) {}

  async handle(query: ListAuditLogQuery): Promise<ListAuditLogResult> {
    const after = query.cursor === null ? undefined : decodeAuditCursor(query.cursor);
    if (after === null) return { outcome: 'invalid_cursor' };
    const { from, to } = query.filters;
    if (from && to && from > to) return { outcome: 'invalid_range' };

    // One more than asked tells whether there is a next page without counting the collection.
    const entries = await this.deps.auditLog.list({ ...query.filters, after, limit: query.limit + 1 });
    const page = entries.slice(0, query.limit);
    const last = page.at(-1);
    return {
      outcome: 'ok',
      items: page.map(toAuditSummary),
      nextCursor: entries.length > query.limit && last ? encodeAuditCursor({ at: last.at, id: last.id }) : null,
    };
  }
}
