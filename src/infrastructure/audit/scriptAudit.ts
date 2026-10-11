import type { AuditEntry } from '../../domain/staff/auditEntry.js';

export interface ScriptAuditInput {
  id: string;
  at: Date;
  /** The script's name, e.g. `seed-owner`. */
  script: string;
  permission: string;
  action: string;
  resourceType: string;
  resourceId: string;
  /** The command's outcome, e.g. `created` or `last_owner`. */
  outcome: string;
  rejected?: boolean;
  /** Already free of personal data (an email's domain, never the address). */
  request?: Record<string, unknown>;
}

/**
 * The audit entry of an operations script (`scripts/seed-owner.ts`, `scripts/staff.ts`): team
 * changes made outside the admin web leave the same trail, with the script as the actor.
 */
export function scriptAuditEntry(input: ScriptAuditInput): AuditEntry {
  return {
    id: input.id,
    at: input.at,
    kind: 'write',
    actor: { system: 'script', name: input.script },
    sessionId: null,
    permission: input.permission,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    outcome: input.rejected ? 'rejected' : 'done',
    httpStatus: null,
    errorCode: input.rejected ? input.outcome : null,
    before: null,
    after: input.rejected ? null : { outcome: input.outcome },
    request: input.request ?? null,
    ip: null,
    userAgent: null,
  };
}
