import type { AuditEntry, AuditKind, AuditOutcome } from '../../../../domain/staff/auditEntry.js';

export interface AuditActorView {
  type: 'staff' | 'script';
  staffId: string | null;
  /** The member's email, or "Script de operación (name)". */
  label: string;
}

/** One line of the audit log as the admin web lists it (contracts/team-api.md). */
export interface AuditEntrySummary {
  id: string;
  at: Date;
  kind: AuditKind;
  actor: AuditActorView;
  permission: string;
  action: string;
  resourceType: string;
  resourceId: string;
  outcome: AuditOutcome;
  httpStatus: number | null;
  errorCode: string | null;
}

export interface AuditEntryDetail extends AuditEntrySummary {
  sessionId: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  request: Record<string, unknown> | null;
  ip: string | null;
  userAgent: string | null;
}

export function toAuditSummary(entry: AuditEntry): AuditEntrySummary {
  return {
    id: entry.id,
    at: entry.at,
    kind: entry.kind,
    actor:
      'staffId' in entry.actor
        ? { type: 'staff', staffId: entry.actor.staffId, label: entry.actor.email }
        : { type: 'script', staffId: null, label: `Script de operación (${entry.actor.name})` },
    permission: entry.permission,
    action: entry.action,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId,
    outcome: entry.outcome,
    httpStatus: entry.httpStatus,
    errorCode: entry.errorCode,
  };
}

export function toAuditDetail(entry: AuditEntry): AuditEntryDetail {
  return {
    ...toAuditSummary(entry),
    sessionId: entry.sessionId,
    before: entry.before,
    after: entry.after,
    request: entry.request,
    ip: entry.ip,
    userAgent: entry.userAgent,
  };
}
