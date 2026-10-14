/**
 * The sign-in code of one address in one product (admin spec 009, research §3): the last code
 * issued, and the successful sends of the last hour. One document per product and address, so
 * "only the last code works" holds by construction. Pure rules, no I/O.
 */
export type LoginCodeAudience = 'app' | 'admin';

/** `none`: a request for an address with no admin access, recorded without a code (research §7). */
export type LoginCodeStatus = 'active' | 'used' | 'invalidated' | 'none';

export const RESEND_COOLDOWN_SECONDS = 60;
export const MAX_SENDS_PER_HOUR = 5;
/** Three wrong codes in a row invalidate the one sent (the user's change after trying 009). */
export const MAX_FAILED_ATTEMPTS = 3;
export const RETENTION_HOURS = 24;

const SEND_WINDOW_MS = 60 * 60 * 1000;
const RETENTION_MS = RETENTION_HOURS * 60 * 60 * 1000;

export interface LoginCodeState {
  id: string;
  audience: LoginCodeAudience;
  email: string;
  codeId: string | null;
  /** HMAC of the code; never the code itself (FR-019). Null while `status` is `none`. */
  codeHash: string | null;
  status: LoginCodeStatus;
  issuedAt: Date;
  expiresAt: Date;
  /** The minutes the code was issued with: the email shows this number (FR-011). */
  expiryMinutes: number;
  failedAttempts: number;
  /** Successful sends within the last hour, oldest first. */
  sends: Date[];
  lastSentAt: Date | null;
  revision: number;
  purgeAt: Date;
}

export type IssueDecision =
  | { outcome: 'ok' }
  | { outcome: 'resend_too_soon'; retryAfterSeconds: number }
  | { outcome: 'too_many_codes'; retryAfterSeconds: number; retryAt: Date };

export type VerificationFailure = 'invalid_code' | 'code_expired' | 'too_many_attempts';

export function loginCodeId(audience: LoginCodeAudience, email: string): string {
  return `${audience}:${email}`;
}

function sendsWithinHour(sends: readonly Date[], now: Date): Date[] {
  return sends.filter((sent) => now.getTime() - sent.getTime() < SEND_WINDOW_MS);
}

const secondsUntil = (instant: number, now: Date) => Math.max(1, Math.ceil((instant - now.getTime()) / 1000));

/** 60 s since the last successful send, and at most 5 sends in the last 60 minutes (FR-006, FR-007). */
export function canIssue(state: LoginCodeState | null, now: Date): IssueDecision {
  if (!state) return { outcome: 'ok' };
  if (state.lastSentAt) {
    const cooldownEnds = state.lastSentAt.getTime() + RESEND_COOLDOWN_SECONDS * 1000;
    if (now.getTime() < cooldownEnds) return { outcome: 'resend_too_soon', retryAfterSeconds: secondsUntil(cooldownEnds, now) };
  }
  const recent = sendsWithinHour(state.sends, now);
  if (recent.length >= MAX_SENDS_PER_HOUR) {
    const freesAt = recent[0]!.getTime() + SEND_WINDOW_MS;
    return { outcome: 'too_many_codes', retryAfterSeconds: secondsUntil(freesAt, now), retryAt: new Date(freesAt) };
  }
  return { outcome: 'ok' };
}

/** A new code (or, without a hash, a request without one) that replaces whatever was there. */
export function issueLoginCode(
  previous: LoginCodeState | null,
  params: { audience: LoginCodeAudience; email: string; codeId: string; codeHash: string | null; expiryMinutes: number; now: Date },
): LoginCodeState {
  const { now } = params;
  const expiresAt = new Date(now.getTime() + params.expiryMinutes * 60 * 1000);
  return {
    id: loginCodeId(params.audience, params.email),
    audience: params.audience,
    email: params.email,
    codeId: params.codeId,
    codeHash: params.codeHash,
    status: params.codeHash === null ? 'none' : 'active',
    issuedAt: now,
    expiresAt,
    expiryMinutes: params.expiryMinutes,
    failedAttempts: 0,
    sends: [...sendsWithinHour(previous?.sends ?? [], now), now],
    lastSentAt: now,
    revision: previous ? previous.revision + 1 : 0,
    purgeAt: new Date(expiresAt.getTime() + RETENTION_MS),
  };
}

/**
 * The email provider failed: the code that never arrived stops working and its send does not
 * count for the wait nor the hourly limit (FR-008). Null when that code was already replaced.
 */
export function revertFailedSend(state: LoginCodeState, codeId: string, previousLastSentAt: Date | null, now: Date): LoginCodeState | null {
  if (state.codeId !== codeId) return null;
  const sends = [...state.sends];
  const index = sends.findIndex((sent) => sent.getTime() === state.lastSentAt?.getTime());
  if (index >= 0) sends.splice(index, 1);
  return {
    ...state,
    status: 'invalidated',
    sends,
    lastSentAt: previousLastSentAt,
    revision: state.revision + 1,
    purgeAt: new Date(now.getTime() + RETENTION_MS),
  };
}

/** Why a code that the atomic check did not accept was refused (FR-010, FR-012). */
export function verificationOutcome(state: LoginCodeState | null, now: Date): VerificationFailure {
  if (!state) return 'invalid_code';
  if (state.failedAttempts >= MAX_FAILED_ATTEMPTS) return 'too_many_attempts';
  if (state.status !== 'active') return 'invalid_code';
  if (state.expiresAt.getTime() <= now.getTime()) return 'code_expired';
  return 'invalid_code';
}

/** When a code stops working early (used, invalidated): its record goes 24 h later (FR-021). */
export function purgeAfter(now: Date): Date {
  return new Date(now.getTime() + RETENTION_MS);
}
