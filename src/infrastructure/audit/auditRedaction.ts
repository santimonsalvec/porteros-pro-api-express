/**
 * What of an admin write may go into the audit log (`adminAuditLog`, kept forever): an allowlist
 * of field names per resource type, applied at every depth, plus names that never pass anywhere.
 * A field not listed is left out — the log never learns a secret by accident.
 */
const ALLOWED_FIELDS: Readonly<Record<string, readonly string[]>> = {
  wallet: [
    'goalkeeperId', 'balance', 'currency', 'id', 'movementId', 'type', 'amount', 'reason', 'operationKey',
    'sequence', 'createdAt', 'actor', 'kind', 'adminId',
  ],
  withdrawal: [
    'withdrawal', 'withdrawalId', 'id', 'bookingId', 'kind', 'occurredAt', 'penalty', 'commission', 'amount',
    'suspension', 'suspendedUntil', 'refund', 'liftSuspension', 'reason', 'reversal', 'reversedAt', 'reversedBy',
    'status', 'countsTowardLimit',
  ],
  case: ['caseId', 'id', 'type', 'status', 'bookingId', 'requestId', 'resolution', 'by', 'at', 'note'],
  paymentGatewaySettings: [
    'countryId', 'gateway', 'publicConfig', 'environment', 'currency', 'costs', 'percentBps', 'fixed', 'vatBps',
    'amounts', 'updatedAt', 'updatedBy',
  ],
  taxSettings: ['countryId', 'vatRateBps', 'updatedAt', 'updatedBy'],
  invoicingSettings: ['countryId', 'provider', 'updatedAt', 'updatedBy'],
  invoicingDocument: ['documentId', 'id', 'kind', 'status', 'attempts', 'sourceMovementId', 'errorCode', 'retriedAt'],
  // The team (spec 002): the member's email may go to the audit log, never to the logs.
  staffMember: [
    'id', 'staffId', 'email', 'displayName', 'roleIds', 'roleId', 'role', 'name', 'status', 'invitedAt',
    'inviteExpiresAt', 'lastSignInAt', 'reason',
  ],
  staffRole: ['id', 'name', 'description', 'permissions', 'system', 'memberCount', 'reason'],
};

/** Never stored, at any depth and whatever the resource: secrets, identity documents, phones, comments. */
const FORBIDDEN = /token|password|secret|credential|cookie|authorization|accesskey|privatekey|publickey|documentnumber|phone|whatsapp|comment/i;

export function redactForAudit(resourceType: string, value: unknown): Record<string, unknown> | null {
  const allowed = ALLOWED_FIELDS[resourceType];
  if (!allowed || !isPlainObject(value)) return null;
  return redactObject(value, new Set(allowed));
}

function redactObject(value: Record<string, unknown>, allowed: ReadonlySet<string>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (!allowed.has(key) || FORBIDDEN.test(key)) continue;
    result[key] = redactValue(item, allowed);
  }
  return result;
}

function redactValue(value: unknown, allowed: ReadonlySet<string>): unknown {
  if (Array.isArray(value)) return value.map((item) => redactValue(item, allowed));
  if (isPlainObject(value)) return redactObject(value, allowed);
  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date);
}
