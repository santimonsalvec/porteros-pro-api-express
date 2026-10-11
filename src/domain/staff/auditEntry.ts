/** Who did it: a staff member through the admin web, or an operations script. */
export type AuditActor = { staffId: string; userId: string; email: string } | { system: 'script'; name: string };

export type AuditKind = 'write' | 'read';

/** `denied`: stopped by a missing permission; `rejected`: refused by validation or a business rule. */
export type AuditOutcome = 'done' | 'replayed' | 'rejected' | 'denied';

/**
 * One line of the append-only administration audit log (`adminAuditLog`, no expiry). `before`,
 * `after` and `request` are already redacted to an allowlist: never secrets, tokens, identity
 * documents, phone numbers nor rating comments.
 */
export interface AuditEntry {
  id: string;
  at: Date;
  kind: AuditKind;
  actor: AuditActor;
  sessionId: string | null;
  permission: string;
  action: string;
  resourceType: string;
  resourceId: string;
  outcome: AuditOutcome;
  httpStatus: number | null;
  errorCode: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  request: Record<string, unknown> | null;
  ip: string | null;
  userAgent: string | null;
}
