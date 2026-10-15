import type { IImageRepository } from '../../images/common/ports.js';
import type { IUserBlockRepository } from '../../users/common/ports.js';
import type { Verification, VettingActor } from '../../../../domain/goalkeepers/vetting.js';
import type { FieldErrors, VettingDependencies } from './vettingDependencies.js';

/** What an administrator sends to verify a goalkeeper by hand (admin spec 030, contracts C6). */
export type VerificationInput =
  | { method: 'referral'; referrerId: string }
  | { method: 'other_platform'; platformName: string; evidenceImageIds: string[] }
  | { method: 'practice'; evaluatedOn: string; result: 'passed' | 'failed'; notes: string | null };

/** What checking a manual verification needs besides the vetting itself. */
export interface VerificationSupport {
  images: Pick<IImageRepository, 'getById'>;
  blocks: Pick<IUserBlockRepository, 'findByUserId'>;
}

export const MAX_EVIDENCE_IMAGES = 5;
const PLATFORM_NAME = { min: 2, max: 80 };
const NOTES_MAX = 300;

export type ResolvedVerification =
  | { kind: 'grant'; verification: Verification }
  /** A practice the goalkeeper did not pass: recorded, never a seal. */
  | { kind: 'practice_failed'; details: { evaluatedOn: string; notes: string | null } }
  | { kind: 'invalid_referrer' }
  | { kind: 'invalid_evidence' }
  | { kind: 'invalid_fields'; fieldErrors: FieldErrors };

/**
 * Checks a manual verification and builds it (FR-007 to FR-010): the referrer is another validated,
 * unblocked goalkeeper; the platform has a name and at most 5 stored images; the practice happened
 * on a day that is not in the future.
 */
export async function resolveVerification(
  deps: Pick<VettingDependencies, 'profiles'> & VerificationSupport,
  goalkeeperId: string,
  staffUserId: string,
  input: VerificationInput,
  now: Date,
): Promise<ResolvedVerification> {
  const by: VettingActor = { kind: 'staff', userId: staffUserId };
  switch (input.method) {
    case 'referral': {
      if (input.referrerId === goalkeeperId) return { kind: 'invalid_referrer' };
      const [referrer, block] = await Promise.all([deps.profiles.getByUserId(input.referrerId), deps.blocks.findByUserId(input.referrerId)]);
      if (!referrer || referrer.tier === 'unvalidated' || block?.blocked) return { kind: 'invalid_referrer' };
      return { kind: 'grant', verification: { method: 'referral', at: now, by, details: { referrerId: input.referrerId } } };
    }
    case 'other_platform': {
      const platformName = input.platformName.trim();
      if (platformName.length < PLATFORM_NAME.min || platformName.length > PLATFORM_NAME.max) {
        return { kind: 'invalid_fields', fieldErrors: { platformName: `platformName must have between ${PLATFORM_NAME.min} and ${PLATFORM_NAME.max} characters` } };
      }
      const evidenceImageIds = [...new Set(input.evidenceImageIds)];
      if (evidenceImageIds.length > MAX_EVIDENCE_IMAGES) {
        return { kind: 'invalid_fields', fieldErrors: { evidenceImageIds: `At most ${MAX_EVIDENCE_IMAGES} images` } };
      }
      const stored = await Promise.all(evidenceImageIds.map((id) => deps.images.getById(id)));
      if (stored.some((image) => image === null)) return { kind: 'invalid_evidence' };
      return { kind: 'grant', verification: { method: 'other_platform', at: now, by, details: { platformName, evidenceImageIds } } };
    }
    case 'practice': {
      const notes = input.notes?.trim() || null;
      if (notes && notes.length > NOTES_MAX) return { kind: 'invalid_fields', fieldErrors: { notes: `notes must have at most ${NOTES_MAX} characters` } };
      // A day, compared as text: today (UTC) at the latest.
      if (input.evaluatedOn > now.toISOString().slice(0, 10)) return { kind: 'invalid_fields', fieldErrors: { evaluatedOn: 'evaluatedOn cannot be in the future' } };
      const details = { evaluatedOn: input.evaluatedOn, notes };
      if (input.result === 'failed') return { kind: 'practice_failed', details };
      return { kind: 'grant', verification: { method: 'practice', at: now, by, details } };
    }
  }
}
