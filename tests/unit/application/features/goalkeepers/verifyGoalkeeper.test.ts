import { beforeEach, describe, expect, it } from 'vitest';
import { VerifyGoalkeeperCommand } from '../../../../../src/application/features/goalkeepers/commands/verifyGoalkeeper/verifyGoalkeeperCommand.js';
import { VerifyGoalkeeperCommandHandler } from '../../../../../src/application/features/goalkeepers/commands/verifyGoalkeeper/verifyGoalkeeperCommandHandler.js';
import { DecideValidationCommand } from '../../../../../src/application/features/goalkeepers/commands/decideValidation/decideValidationCommand.js';
import { DecideValidationCommandHandler } from '../../../../../src/application/features/goalkeepers/commands/decideValidation/decideValidationCommandHandler.js';
import type { VerificationInput } from '../../../../../src/application/features/goalkeepers/common/verificationInput.js';
import { PENDING_VETTING, vettingTier } from '../../../../../src/domain/goalkeepers/vetting.js';
import { StoredImage } from '../../../../../src/domain/images/storedImage.js';
import { FakeImageRepository } from '../../../../fakes/fakeImageRepository.js';
import { FakeUserBlockRepository } from '../../../../fakes/fakeUserBlockRepository.js';
import { VALIDATED_VETTING, VERIFIED_VETTING } from '../../../../fixtures/vettingFixtures.js';
import { VETTING_NOW, VettingHarness } from './vettingHarness.js';

let h: VettingHarness;
let images: FakeImageRepository;
let blocks: FakeUserBlockRepository;

beforeEach(() => {
  h = new VettingHarness();
  images = new FakeImageRepository();
  blocks = new FakeUserBlockRepository();
  h.goalkeeper('gk-1', VALIDATED_VETTING);
  h.goalkeeper('gk-ref', VALIDATED_VETTING);
  images.seed(new StoredImage({ id: 'ev-1', externalId: 'x', url: 'https://img/ev-1.jpg', format: 'jpg', bytes: 1, width: 1, height: 1, uploadedBy: 'staff-1', createdAt: VETTING_NOW }));
});

const deps = () => ({ ...h.deps, images, blocks });
const verify = (verification: VerificationInput, fields: { goalkeeperId?: string; revision?: number } = {}) =>
  new VerifyGoalkeeperCommandHandler(deps()).handle(
    new VerifyGoalkeeperCommand({ staffUserId: 'staff-1', goalkeeperId: fields.goalkeeperId ?? 'gk-1', revision: fields.revision ?? VALIDATED_VETTING.revision, verification }),
  );

describe('VerifyGoalkeeper (admin spec 030, contracts C6)', () => {
  it('verifies by referral, keeping the referrer, and tells the goalkeeper', async () => {
    expect(await verify({ method: 'referral', referrerId: 'gk-ref' })).toEqual({ outcome: 'verified' });

    const vetting = await h.vettingOf('gk-1');
    expect(vettingTier(vetting)).toBe('verified');
    expect(vetting.verification).toEqual({ method: 'referral', at: VETTING_NOW, by: { kind: 'staff', userId: 'staff-1' }, details: { referrerId: 'gk-ref' } });
    expect(h.log.entries).toEqual([expect.objectContaining({ action: 'verification.granted', method: 'referral', details: { referrerId: 'gk-ref' } })]);
    expect(h.notifier.sent).toEqual([expect.objectContaining({ kind: 'verified', goalkeeperId: 'gk-1' })]);
  });

  it.each([
    ['the goalkeeper themself', 'gk-1'],
    ['someone who is not a goalkeeper', 'client-9'],
    ['an unvalidated goalkeeper', 'gk-pending'],
    ['a blocked goalkeeper', 'gk-blocked'],
  ])('refuses %s as referrer', async (_label, referrerId) => {
    h.goalkeeper('gk-pending', PENDING_VETTING);
    h.goalkeeper('gk-blocked', VALIDATED_VETTING);
    await blocks.block('gk-blocked', 'staff-1', 'motivo', VETTING_NOW);

    expect(await verify({ method: 'referral', referrerId })).toEqual({ outcome: 'invalid_referrer' });
    expect(vettingTier(await h.vettingOf('gk-1'))).toBe('validated');
  });

  it('verifies by another platform with its evidence, which is optional', async () => {
    expect(await verify({ method: 'other_platform', platformName: '  GoalApp ', evidenceImageIds: ['ev-1'] })).toEqual({ outcome: 'verified' });
    expect((await h.vettingOf('gk-1')).verification?.details).toEqual({ platformName: 'GoalApp', evidenceImageIds: ['ev-1'] });

    h.goalkeeper('gk-2', VALIDATED_VETTING);
    expect(await verify({ method: 'other_platform', platformName: 'GoalApp', evidenceImageIds: [] }, { goalkeeperId: 'gk-2' })).toEqual({ outcome: 'verified' });
  });

  it('checks the platform name and the evidence', async () => {
    expect(await verify({ method: 'other_platform', platformName: 'G', evidenceImageIds: [] })).toEqual({ outcome: 'invalid_fields', fieldErrors: { platformName: expect.any(String) } });
    expect(await verify({ method: 'other_platform', platformName: 'GoalApp', evidenceImageIds: ['missing'] })).toEqual({ outcome: 'invalid_evidence' });
    expect(await verify({ method: 'other_platform', platformName: 'GoalApp', evidenceImageIds: ['a', 'b', 'c', 'd', 'e', 'f'] })).toEqual({
      outcome: 'invalid_fields',
      fieldErrors: { evidenceImageIds: expect.any(String) },
    });
  });

  it('a passed practice verifies; a failed one is only recorded', async () => {
    expect(await verify({ method: 'practice', evaluatedOn: '2026-10-14', result: 'failed', notes: 'Le faltó salida' })).toEqual({ outcome: 'practice_failed' });
    expect(vettingTier(await h.vettingOf('gk-1'))).toBe('validated');
    expect(h.log.entries[0]).toMatchObject({ action: 'practice.failed', method: 'practice', details: { evaluatedOn: '2026-10-14', notes: 'Le faltó salida' } });
    expect(h.notifier.sent).toHaveLength(0);

    expect(await verify({ method: 'practice', evaluatedOn: '2026-10-15', result: 'passed', notes: null })).toEqual({ outcome: 'verified' });
    expect((await h.vettingOf('gk-1')).verification?.details).toEqual({ evaluatedOn: '2026-10-15', notes: null });
  });

  it('refuses a practice in the future', async () => {
    expect(await verify({ method: 'practice', evaluatedOn: '2026-10-16', result: 'passed', notes: null })).toEqual({
      outcome: 'invalid_fields',
      fieldErrors: { evaluatedOn: expect.any(String) },
    });
  });

  it('answers not validated, already verified, stale and unknown', async () => {
    h.goalkeeper('gk-pending', PENDING_VETTING);
    h.goalkeeper('gk-verified', VERIFIED_VETTING);
    const referral: VerificationInput = { method: 'referral', referrerId: 'gk-ref' };

    expect(await verify(referral, { goalkeeperId: 'gk-pending', revision: 0 })).toEqual({ outcome: 'not_validated' });
    expect(await verify(referral, { goalkeeperId: 'gk-verified', revision: VERIFIED_VETTING.revision })).toEqual({ outcome: 'already_verified' });
    expect(await verify(referral, { revision: 9 })).toEqual({ outcome: 'stale' });
    expect(await verify(referral, { goalkeeperId: 'nobody' })).toEqual({ outcome: 'not_a_goalkeeper' });
  });
});

describe('DecideValidation with a verification (FR-011)', () => {
  it('validates and verifies in one step, and tells the goalkeeper both', async () => {
    h.goalkeeper('gk-3', PENDING_VETTING);
    h.check('gk-3', 'bc-3');

    const result = await new DecideValidationCommandHandler(deps()).handle(
      new DecideValidationCommand({ staffUserId: 'staff-1', goalkeeperId: 'gk-3', revision: 0, decision: 'approve', verification: { method: 'referral', referrerId: 'gk-ref' } }),
    );

    expect(result).toEqual({ outcome: 'approved' });
    const vetting = await h.vettingOf('gk-3');
    expect(vettingTier(vetting)).toBe('verified');
    expect(vetting.revision).toBe(1);
    expect(h.log.actionsOf('gk-3')).toEqual(['validation.approved', 'verification.granted']);
    expect(h.notifier.sent.map((notice) => notice.kind)).toEqual(['validated', 'verified']);
  });

  it('writes nothing when the verification is not valid', async () => {
    h.goalkeeper('gk-3', PENDING_VETTING);
    h.check('gk-3', 'bc-3');

    const result = await new DecideValidationCommandHandler(deps()).handle(
      new DecideValidationCommand({ staffUserId: 'staff-1', goalkeeperId: 'gk-3', revision: 0, decision: 'approve', verification: { method: 'referral', referrerId: 'gk-3' } }),
    );

    expect(result).toEqual({ outcome: 'invalid_referrer' });
    expect(vettingTier(await h.vettingOf('gk-3'))).toBe('unvalidated');
    expect(h.log.entries).toHaveLength(0);
  });
});
