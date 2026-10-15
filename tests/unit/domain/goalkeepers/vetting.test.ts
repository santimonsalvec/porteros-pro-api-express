import { describe, expect, it } from 'vitest';
import {
  approveValidation,
  grantVerification,
  normalizeVettingReason,
  PENDING_VETTING,
  rejectValidation,
  revokeValidation,
  revokeVerification,
  VettingTransitionError,
  vettingTier,
  type Verification,
  type Vetting,
} from '../../../../src/domain/goalkeepers/vetting.js';

const AT = new Date('2026-10-15T15:00:00.000Z');
const LATER = new Date('2026-10-16T15:00:00.000Z');

const validated = approveValidation(PENDING_VETTING, 'staff-1', AT);
const manual: Verification = { method: 'referral', at: LATER, by: { kind: 'staff', userId: 'staff-2' }, details: { referrerId: 'gk-9' } };
const reputation: Verification = { method: 'reputation', at: LATER, by: { kind: 'system' }, details: { ratingCount: 5, ratingAverage: 4.6 } };

function codeOf(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (error) {
    return error instanceof VettingTransitionError ? error.code : 'other';
  }
}

describe('vettingTier', () => {
  it('reads an absent vetting as unvalidated (profiles from before feature 030)', () => {
    expect(vettingTier(undefined)).toBe('unvalidated');
    expect(vettingTier(null)).toBe('unvalidated');
  });

  it('derives the three tiers', () => {
    expect(vettingTier(PENDING_VETTING)).toBe('unvalidated');
    expect(vettingTier(validated)).toBe('validated');
    expect(vettingTier(grantVerification(validated, manual))).toBe('verified');
  });
});

describe('validation transitions', () => {
  it('approves a pending goalkeeper, clearing an earlier rejection and bumping the revision', () => {
    const rejected = rejectValidation(PENDING_VETTING, 'staff-1', AT, 'Foto ilegible');
    const approved = approveValidation(rejected, 'staff-2', LATER);

    expect(approved).toMatchObject({ validation: 'validated', validatedAt: LATER, validatedBy: 'staff-2', lastRejection: null, verification: null });
    expect(approved.revision).toBe(rejected.revision + 1);
  });

  it('rejects with a trimmed reason and stays pending', () => {
    const rejected = rejectValidation(PENDING_VETTING, 'staff-1', AT, '  Foto ilegible  ');

    expect(rejected).toMatchObject({ validation: 'pending', lastRejection: { reason: 'Foto ilegible', at: AT, by: 'staff-1' } });
    expect(rejected.revision).toBe(1);
  });

  it('refuses to approve or reject an already validated goalkeeper', () => {
    expect(codeOf(() => approveValidation(validated, 'staff-1', AT))).toBe('already_validated');
    expect(codeOf(() => rejectValidation(validated, 'staff-1', AT, 'motivo'))).toBe('already_validated');
  });

  it('revoking the validation returns to pending, drops the verification and blocks reputation', () => {
    const revoked = revokeValidation(grantVerification(validated, manual));

    expect(revoked).toMatchObject({ validation: 'pending', validatedAt: null, validatedBy: null, verification: null, autoVerificationBlocked: true });
    expect(vettingTier(revoked)).toBe('unvalidated');
  });

  it('cannot revoke a validation that does not exist', () => {
    expect(codeOf(() => revokeValidation(PENDING_VETTING))).toBe('not_validated');
  });
});

describe('verification transitions', () => {
  it('cannot verify a goalkeeper who is not validated', () => {
    expect(codeOf(() => grantVerification(PENDING_VETTING, manual))).toBe('not_validated');
  });

  it('cannot verify twice', () => {
    expect(codeOf(() => grantVerification(grantVerification(validated, manual), manual))).toBe('already_verified');
  });

  it('a manual verification lifts the reputation block', () => {
    const blocked = revokeVerification(grantVerification(validated, manual));
    expect(blocked.autoVerificationBlocked).toBe(true);

    expect(grantVerification(blocked, manual).autoVerificationBlocked).toBe(false);
  });

  it('the system cannot verify by reputation while blocked', () => {
    const blocked = revokeVerification(grantVerification(validated, manual));

    expect(codeOf(() => grantVerification(blocked, reputation))).toBe('auto_verification_blocked');
    expect(vettingTier(grantVerification(validated, reputation))).toBe('verified');
  });

  it('revoking a verification returns to validated', () => {
    const verified: Vetting = grantVerification(validated, manual);
    const revoked = revokeVerification(verified);

    expect(vettingTier(revoked)).toBe('validated');
    expect(revoked.revision).toBe(verified.revision + 1);
    expect(codeOf(() => revokeVerification(revoked))).toBe('not_verified');
  });
});

describe('normalizeVettingReason', () => {
  it('trims and accepts 3 to 300 characters', () => {
    expect(normalizeVettingReason('  abc ')).toBe('abc');
    expect(normalizeVettingReason('x'.repeat(300))).toHaveLength(300);
  });

  it.each(['', '  ab ', 'x'.repeat(301)])('refuses %j', (raw) => {
    expect(() => normalizeVettingReason(raw)).toThrow();
  });
});
