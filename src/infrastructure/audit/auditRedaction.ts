/**
 * What of an admin write may go into the audit log (`adminAuditLog`, kept forever): an allowlist
 * of field names per resource type, applied at every depth, plus names that never pass anywhere.
 * A field not listed is left out — the log never learns a secret by accident.
 */
const PRICE_FIELDS = [
  'id', 'scope', 'refId', 'modality', 'level', 'amount', 'revision', 'invalid', 'currency', 'countryId', 'countryName',
  'cityId', 'cityName', 'zoneName', 'zoneActive', 'targetValid', 'reason',
];

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
    'amounts', 'updatedAt', 'updatedBy', 'revision', 'credentialsPresent',
  ],
  taxSettings: ['countryId', 'vatRateBps', 'updatedAt', 'updatedBy'],
  invoicingSettings: ['countryId', 'provider', 'updatedAt', 'updatedBy', 'revision', 'credentialsPresent'],
  invoicingDocument: ['documentId', 'id', 'kind', 'status', 'attempts', 'sourceMovementId', 'errorCode', 'retriedAt'],
  // The team (spec 002): the member's email may go to the audit log, never to the logs.
  staffMember: [
    'id', 'staffId', 'email', 'displayName', 'roleIds', 'roleId', 'role', 'name', 'status', 'invitedAt',
    'inviteExpiresAt', 'lastSignInAt', 'reason',
  ],
  staffRole: ['id', 'name', 'description', 'permissions', 'system', 'memberCount', 'reason'],
  // Geography and catalogs (spec 003 of the admin): reference data, nothing personal or secret.
  country: ['id', 'name', 'countryCode', 'dialCode', 'currency', 'operating', 'regionCount', 'revision', 'reason'],
  region: ['id', 'name', 'countryId', 'countryName', 'cityCount', 'revision', 'reason'],
  city: [
    'id', 'name', 'region', 'country', 'countryCode', 'timeZone', 'timeZoneValid', 'daneStateCode', 'daneCityCode',
    'zoneCity', 'zoneCount', 'satelliteCount', 'state', 'revision', 'reason',
  ],
  zone: [
    'id', 'cityId', 'name', 'slug', 'active', 'displayOrder', 'geometry', 'type', 'coordinates', 'geometryValid', 'inUse',
    'revision', 'reason',
  ],
  documentType: ['id', 'code', 'name', 'invoiceable', 'inUse', 'revision', 'reason'],
  matchSurface: ['id', 'name', 'active', 'order', 'inUse', 'revision', 'reason'],
  // Users and goalkeepers (spec 005 of the admin): a correction keeps only the last 4 digits of the
  // phone (`numberEnding`) and whether the document number changed — never the numbers themselves.
  // Spec 006 adds the result of a test push sent to the user (never its text).
  user: [
    'id', 'firstName', 'lastName', 'countryCallingCode', 'numberEnding', 'changedFields', 'version', 'isProfileComplete',
    'userId', 'reached', 'removed', 'failed', 'noDevice',
  ],
  goalkeeper: ['userId', 'documentType', 'code', 'name', 'idNumberChanged', 'changedFields', 'version'],
  userBlock: ['userId', 'blocked', 'reason', 'blockedAt', 'unblockedAt', 'availableForOffers'],
  // Operations (spec 006 of the admin): an administrator cancellation keeps its internal reason and
  // the status of each booking; a check-in photo read (`booking`) stores no body at all.
  request: ['requestId', 'bookingId', 'status', 'bookings', 'cancelledBy', 'reason', 'refunds', 'cancelled'],
  booking: [],
  // Finance (spec 007 of the admin): a forced reconciliation keeps its outcome, never the payment's
  // references; an export keeps its filters and how many rows left, never a row.
  topUp: ['topUpId', 'status', 'answer', 'result', 'statusAfter'],
  topUps: ['status', 'countryId', 'goalkeeperId', 'from', 'to', 'rows'],
  invoicingDocuments: ['status', 'kind', 'countryId', 'goalkeeperId', 'from', 'to', 'stale', 'rows'],
  // Prices and booking rules (spec 004 of the admin): configuration values, nothing personal or secret.
  rentalRate: [...PRICE_FIELDS, 'durationMinutes'],
  commissionSetting: [...PRICE_FIELDS, 'vatRateBps', 'vatAmount', 'totalWithVat'],
  bookingSettings: [
    'countryId', 'countryName', 'cityId', 'cityName', 'currency', 'revision', 'own', 'country', 'defaults', 'effective',
    'value', 'origin', 'bookingWindowDays', 'minNoticeMinutes', 'freeCancellationMinutes', 'travelBufferMinutes',
    'leadTimeSurcharge', 'tiers', 'fromMinutes', 'toMinutes', 'amount', 'goalkeeperPenalties', 'lateNoticeMinutes',
    'lateSuspensionDays', 'weeklyLimit', 'windowDays', 'limitSuspensionDays', 'checkInWindow', 'opensMinutesBefore',
    'closesMinutesAfter', 'noShowGraceMinutes',
  ],
};

/** Never stored, at any depth and whatever the resource: secrets, identity documents, phones, comments. */
const FORBIDDEN = /token|password|secret|credential|cookie|authorization|accesskey|privatekey|publickey|documentnumber|phone|whatsapp|comment/i;

/** Names that match `FORBIDDEN` but only say whether something exists (spec 007): a boolean, never the value. */
const PRESENCE_FLAGS: ReadonlySet<string> = new Set(['credentialsPresent']);

export function redactForAudit(resourceType: string, value: unknown): Record<string, unknown> | null {
  const allowed = ALLOWED_FIELDS[resourceType];
  if (!allowed || !isPlainObject(value)) return null;
  return redactObject(value, new Set(allowed));
}

function redactObject(value: Record<string, unknown>, allowed: ReadonlySet<string>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (!allowed.has(key) || (FORBIDDEN.test(key) && !PRESENCE_FLAGS.has(key))) continue;
    if (PRESENCE_FLAGS.has(key) && typeof item !== 'boolean') continue;
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
