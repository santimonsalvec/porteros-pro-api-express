/**
 * The two levels a goalkeeper passes before and after taking matches (admin spec 030): the internal,
 * mandatory validation (identity and background checks) and the verification seal (referral, another
 * platform, a practice, or reputation). The visible tier is always derived, never stored, so a
 * "verified but not validated" goalkeeper cannot exist (research §1).
 */

export const VERIFICATION_METHODS = ['referral', 'other_platform', 'practice', 'reputation'] as const;
export type VerificationMethod = (typeof VERIFICATION_METHODS)[number];

export type VettingTier = 'unvalidated' | 'validated' | 'verified';

export type VettingActor = { kind: 'staff'; userId: string } | { kind: 'system' };

export type VerificationDetails =
  | { referrerId: string }
  | { platformName: string; evidenceImageIds: string[] }
  | { evaluatedOn: string; notes: string | null }
  | { ratingCount: number; ratingAverage: number };

export interface Verification {
  method: VerificationMethod;
  at: Date;
  by: VettingActor;
  details: VerificationDetails;
}

export interface Vetting {
  validation: 'pending' | 'validated';
  validatedAt: Date | null;
  /** The staff member (user id) who validated. */
  validatedBy: string | null;
  lastRejection: { reason: string; at: Date; by: string } | null;
  verification: Verification | null;
  /** Set when an administrator revokes: reputation can no longer verify on its own (research §7). */
  autoVerificationBlocked: boolean;
  /** Optimistic-concurrency counter of the admin web. */
  revision: number;
}

/** A goalkeeper nobody has reviewed yet — also how a profile without `vetting` is read (research §2). */
export const PENDING_VETTING: Vetting = Object.freeze({
  validation: 'pending',
  validatedAt: null,
  validatedBy: null,
  lastRejection: null,
  verification: null,
  autoVerificationBlocked: false,
  revision: 0,
});

export type VettingTransitionCode =
  | 'already_validated'
  | 'not_validated'
  | 'already_verified'
  | 'not_verified'
  | 'auto_verification_blocked';

/** A transition that does not apply to the goalkeeper's current state; handlers map `code` to an outcome. */
export class VettingTransitionError extends Error {
  constructor(readonly code: VettingTransitionCode) {
    super(`Vetting transition refused: ${code}`);
    this.name = 'VettingTransitionError';
  }
}

export const VETTING_REASON_MIN = 3;
export const VETTING_REASON_MAX = 300;

/** Trimmed; throws unless 3–300 characters (same bounds as the admin's cancellation reason). */
export function normalizeVettingReason(raw: string): string {
  const reason = raw.trim();
  if (reason.length < VETTING_REASON_MIN || reason.length > VETTING_REASON_MAX) {
    throw new Error(`Vetting reason must have between ${VETTING_REASON_MIN} and ${VETTING_REASON_MAX} characters`);
  }
  return reason;
}

export function vettingTier(vetting: Vetting | null | undefined): VettingTier {
  if (!vetting || vetting.validation !== 'validated') return 'unvalidated';
  return vetting.verification ? 'verified' : 'validated';
}

function next(vetting: Vetting, changes: Partial<Vetting>): Vetting {
  return { ...vetting, ...changes, revision: vetting.revision + 1 };
}

export function approveValidation(vetting: Vetting, by: string, at: Date): Vetting {
  if (vetting.validation === 'validated') throw new VettingTransitionError('already_validated');
  return next(vetting, { validation: 'validated', validatedAt: at, validatedBy: by, lastRejection: null });
}

export function rejectValidation(vetting: Vetting, by: string, at: Date, reason: string): Vetting {
  if (vetting.validation === 'validated') throw new VettingTransitionError('already_validated');
  return next(vetting, { lastRejection: { reason: normalizeVettingReason(reason), at, by } });
}

/** Back to pending: the verification goes too, and reputation stays blocked (research §9). */
export function revokeValidation(vetting: Vetting): Vetting {
  if (vetting.validation !== 'validated') throw new VettingTransitionError('not_validated');
  return next(vetting, { validation: 'pending', validatedAt: null, validatedBy: null, verification: null, autoVerificationBlocked: true });
}

/** A manual verification lifts the reputation block; the system's is refused while blocked. */
export function grantVerification(vetting: Vetting, verification: Verification): Vetting {
  if (vetting.validation !== 'validated') throw new VettingTransitionError('not_validated');
  if (vetting.verification) throw new VettingTransitionError('already_verified');
  const bySystem = verification.by.kind === 'system';
  if (bySystem && vetting.autoVerificationBlocked) throw new VettingTransitionError('auto_verification_blocked');
  return next(vetting, { verification, autoVerificationBlocked: bySystem ? vetting.autoVerificationBlocked : false });
}

export function revokeVerification(vetting: Vetting): Vetting {
  if (!vetting.verification) throw new VettingTransitionError('not_verified');
  return next(vetting, { verification: null, autoVerificationBlocked: true });
}
