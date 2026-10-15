import { approveValidation, grantVerification, PENDING_VETTING, type Vetting } from '../../src/domain/goalkeepers/vetting.js';

const AT = new Date('2026-09-01T00:00:00.000Z');

/** Validated by the team, without the seal (admin spec 030). */
export const VALIDATED_VETTING: Vetting = approveValidation(PENDING_VETTING, 'staff-fixture', AT);

/**
 * Validated and verified: what every goalkeeper of the tests written before 030 is, so they keep
 * taking matches exactly as before (plan, Complexity Tracking).
 */
export const VERIFIED_VETTING: Vetting = grantVerification(VALIDATED_VETTING, {
  method: 'practice',
  at: AT,
  by: { kind: 'staff', userId: 'staff-fixture' },
  details: { evaluatedOn: '2026-09-01', notes: null },
});
