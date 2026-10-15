import { beforeEach, describe, expect, it } from 'vitest';
import { RevokeValidationCommand } from '../../../../../src/application/features/goalkeepers/commands/revokeValidation/revokeValidationCommand.js';
import { RevokeValidationCommandHandler } from '../../../../../src/application/features/goalkeepers/commands/revokeValidation/revokeValidationCommandHandler.js';
import { RevokeVerificationCommand } from '../../../../../src/application/features/goalkeepers/commands/revokeVerification/revokeVerificationCommand.js';
import { RevokeVerificationCommandHandler } from '../../../../../src/application/features/goalkeepers/commands/revokeVerification/revokeVerificationCommandHandler.js';
import { PENDING_VETTING, vettingTier } from '../../../../../src/domain/goalkeepers/vetting.js';
import { VALIDATED_VETTING, VERIFIED_VETTING } from '../../../../fixtures/vettingFixtures.js';
import { VettingHarness } from './vettingHarness.js';

let h: VettingHarness;

beforeEach(() => {
  h = new VettingHarness();
});

describe('RevokeValidation (admin spec 030, FR-020, contracts C5)', () => {
  const revoke = (fields: Partial<ConstructorParameters<typeof RevokeValidationCommand>[0]> = {}) =>
    new RevokeValidationCommandHandler(h.deps).handle(
      new RevokeValidationCommand({ staffUserId: 'staff-1', goalkeeperId: 'gk-1', revision: VERIFIED_VETTING.revision, reason: 'Antecedente falso', ...fields }),
    );

  it('sends a verified goalkeeper back to unvalidated, drops the seal and blocks reputation', async () => {
    h.goalkeeper('gk-1', VERIFIED_VETTING);

    expect(await revoke()).toEqual({ outcome: 'revoked' });

    const vetting = await h.vettingOf('gk-1');
    expect(vettingTier(vetting)).toBe('unvalidated');
    expect(vetting).toMatchObject({ verification: null, autoVerificationBlocked: true });
    expect(h.log.entries).toEqual([expect.objectContaining({ action: 'validation.revoked', reason: 'Antecedente falso', actor: { kind: 'staff', userId: 'staff-1' } })]);
  });

  it('needs a reason, a validated goalkeeper and the revision read', async () => {
    h.goalkeeper('gk-1', VERIFIED_VETTING);
    h.goalkeeper('gk-2', PENDING_VETTING);

    expect(await revoke({ reason: 'x' })).toEqual({ outcome: 'invalid_fields', fieldErrors: { reason: expect.any(String) } });
    expect(await revoke({ goalkeeperId: 'gk-2', revision: 0 })).toEqual({ outcome: 'not_validated' });
    expect(await revoke({ revision: 99 })).toEqual({ outcome: 'stale' });
    expect(await revoke({ goalkeeperId: 'nobody' })).toEqual({ outcome: 'not_a_goalkeeper' });
  });
});

describe('RevokeVerification (contracts C7)', () => {
  const revoke = (fields: Partial<ConstructorParameters<typeof RevokeVerificationCommand>[0]> = {}) =>
    new RevokeVerificationCommandHandler(h.deps).handle(
      new RevokeVerificationCommand({ staffUserId: 'staff-1', goalkeeperId: 'gk-1', revision: VERIFIED_VETTING.revision, reason: 'Quejas repetidas', ...fields }),
    );

  it('sends a verified goalkeeper back to validated and stops reputation from giving the seal again', async () => {
    h.goalkeeper('gk-1', VERIFIED_VETTING);

    expect(await revoke()).toEqual({ outcome: 'revoked' });

    const vetting = await h.vettingOf('gk-1');
    expect(vettingTier(vetting)).toBe('validated');
    expect(vetting.autoVerificationBlocked).toBe(true);
    expect(h.log.entries[0]).toMatchObject({ action: 'verification.revoked', reason: 'Quejas repetidas' });
  });

  it('answers not verified', async () => {
    h.goalkeeper('gk-1', VALIDATED_VETTING);

    expect(await revoke({ revision: VALIDATED_VETTING.revision })).toEqual({ outcome: 'not_verified' });
  });
});
