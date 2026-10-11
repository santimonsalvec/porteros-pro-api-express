import type { IQueryHandler } from '../../../../common/mediator/types.js';
import { toAuditDetail } from '../../common/auditViews.js';
import type { AuditQueryDependencies } from '../listAuditLog/listAuditLogQueryHandler.js';
import { GetAuditEntryQuery, type GetAuditEntryResult } from './getAuditEntryQuery.js';

export class GetAuditEntryQueryHandler implements IQueryHandler<GetAuditEntryQuery, GetAuditEntryResult> {
  constructor(private readonly deps: AuditQueryDependencies) {}

  async handle(query: GetAuditEntryQuery): Promise<GetAuditEntryResult> {
    const entry = await this.deps.auditLog.getById(query.entryId);
    return entry ? { outcome: 'ok', entry: toAuditDetail(entry) } : { outcome: 'audit_entry_not_found' };
  }
}
