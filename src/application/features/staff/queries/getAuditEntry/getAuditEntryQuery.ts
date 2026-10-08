import { IQuery } from '../../../../common/mediator/types.js';
import type { AuditEntryDetail } from '../../common/auditViews.js';

export type GetAuditEntryResult = { outcome: 'ok'; entry: AuditEntryDetail } | { outcome: 'audit_entry_not_found' };

export class GetAuditEntryQuery extends IQuery<GetAuditEntryResult> {
  constructor(readonly entryId: string) {
    super();
  }
}
