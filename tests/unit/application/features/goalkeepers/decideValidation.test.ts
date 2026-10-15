import { beforeEach, describe, expect, it } from 'vitest';
import { ReviewBackgroundCheckCommand } from '../../../../../src/application/features/goalkeepers/commands/reviewBackgroundCheck/reviewBackgroundCheckCommand.js';
import { ReviewBackgroundCheckCommandHandler } from '../../../../../src/application/features/goalkeepers/commands/reviewBackgroundCheck/reviewBackgroundCheckCommandHandler.js';
import { DecideValidationCommand } from '../../../../../src/application/features/goalkeepers/commands/decideValidation/decideValidationCommand.js';
import { DecideValidationCommandHandler } from '../../../../../src/application/features/goalkeepers/commands/decideValidation/decideValidationCommandHandler.js';
import { vettingTier } from '../../../../../src/domain/goalkeepers/vetting.js';
import { VALIDATED_VETTING } from '../../../../fixtures/vettingFixtures.js';
import { VETTING_NOW, VettingHarness } from './vettingHarness.js';

let h: VettingHarness;

beforeEach(() => {
  h = new VettingHarness();
  h.goalkeeper('gk-1');
});

describe('ReviewBackgroundCheck (admin spec 030, contracts C3)', () => {
  const review = (fields: Partial<ConstructorParameters<typeof ReviewBackgroundCheckCommand>[0]> = {}) =>
    new ReviewBackgroundCheckCommandHandler(h.deps).handle(
      new ReviewBackgroundCheckCommand({ staffUserId: 'staff-1', goalkeeperId: 'gk-1', checkId: 'bc-1', revision: 0, decision: 'approve', ...fields }),
    );

  it('approves for one year by default and records it in the history', async () => {
    h.check('gk-1', 'bc-1', 'pending');

    expect(await review()).toEqual({ outcome: 'reviewed' });
    const [check] = await h.checks.listForGoalkeeper('gk-1');
    expect(check).toMatchObject({ status: 'approved', reviewedBy: 'staff-1', expiresAt: new Date('2027-10-15T15:00:00.000Z') });
    expect(h.log.entries).toEqual([
      expect.objectContaining({
        goalkeeperId: 'gk-1',
        actor: { kind: 'staff', userId: 'staff-1' },
        action: 'background_check.approved',
        details: { backgroundCheckId: 'bc-1', expiresAt: '2027-10-15T15:00:00.000Z' },
      }),
    ]);
  });

  it('takes the expiry the administrator chose', async () => {
    h.check('gk-1', 'bc-1', 'pending');

    await review({ expiresAt: new Date('2027-03-01T00:00:00.000Z') });

    expect((await h.checks.listForGoalkeeper('gk-1'))[0]!.expiresAt).toEqual(new Date('2027-03-01T00:00:00.000Z'));
  });

  it('rejects with a reason, which is required', async () => {
    h.check('gk-1', 'bc-1', 'pending');

    expect(await review({ decision: 'reject' })).toEqual({ outcome: 'invalid_fields', fieldErrors: { reason: expect.any(String) } });
    expect(await review({ decision: 'reject', reason: 'Ilegible' })).toEqual({ outcome: 'reviewed' });
    expect(h.log.entries[0]).toMatchObject({ action: 'background_check.rejected', reason: 'Ilegible' });
  });

  it('refuses a past expiry', async () => {
    h.check('gk-1', 'bc-1', 'pending');

    expect(await review({ expiresAt: VETTING_NOW })).toEqual({ outcome: 'invalid_fields', fieldErrors: { expiresAt: expect.any(String) } });
  });

  it('answers stale, already reviewed and unknown', async () => {
    h.check('gk-1', 'bc-1', 'pending');

    expect(await review({ revision: 3 })).toEqual({ outcome: 'stale' });
    await review();
    expect(await review({ revision: 1 })).toEqual({ outcome: 'already_reviewed' });
    expect(await review({ checkId: 'bc-9' })).toEqual({ outcome: 'not_found' });
    expect(await review({ goalkeeperId: 'nobody' })).toEqual({ outcome: 'not_a_goalkeeper' });
  });
});

describe('DecideValidation (admin spec 030, contracts C4)', () => {
  const decide = (fields: Partial<ConstructorParameters<typeof DecideValidationCommand>[0]> = {}) =>
    new DecideValidationCommandHandler(h.deps).handle(
      new DecideValidationCommand({ staffUserId: 'staff-1', goalkeeperId: 'gk-1', revision: 0, decision: 'approve', ...fields }),
    );

  it('approves once the checks allow it, records it and tells the goalkeeper', async () => {
    h.check('gk-1', 'bc-1');

    expect(await decide()).toEqual({ outcome: 'approved' });
    const vetting = await h.vettingOf('gk-1');
    expect(vettingTier(vetting)).toBe('validated');
    expect(vetting).toMatchObject({ validatedBy: 'staff-1', validatedAt: VETTING_NOW, revision: 1 });
    expect(h.log.entries).toEqual([expect.objectContaining({ action: 'validation.approved', actor: { kind: 'staff', userId: 'staff-1' } })]);
    expect(h.notifier.sent).toEqual([{ kind: 'validated', goalkeeperId: 'gk-1', logEntryId: h.log.entries[0]!.id }]);
  });

  it('says what is missing when it cannot approve yet', async () => {
    h.check('gk-1', 'bc-1', 'pending');

    expect(await decide()).toEqual({ outcome: 'not_ready', missing: ['approved_background_check', 'pending_background_checks'] });
    expect(h.notifier.sent).toHaveLength(0);
  });

  it('rejects with a reason, keeps the goalkeeper pending and tells them why', async () => {
    expect(await decide({ decision: 'reject' })).toEqual({ outcome: 'invalid_fields', fieldErrors: { reason: expect.any(String) } });

    expect(await decide({ decision: 'reject', reason: 'La foto del certificado no es legible' })).toEqual({ outcome: 'rejected' });
    expect(await h.vettingOf('gk-1')).toMatchObject({ validation: 'pending', lastRejection: { reason: 'La foto del certificado no es legible', by: 'staff-1' } });
    expect(h.log.entries[0]).toMatchObject({ action: 'validation.rejected', reason: 'La foto del certificado no es legible' });
    expect(h.notifier.sent[0]).toMatchObject({ kind: 'validation_rejected', reason: 'La foto del certificado no es legible' });
  });

  it('answers already validated, stale and unknown', async () => {
    h.goalkeeper('gk-2', VALIDATED_VETTING);
    h.check('gk-1', 'bc-1');

    expect(await decide({ goalkeeperId: 'gk-2', revision: VALIDATED_VETTING.revision })).toEqual({ outcome: 'already_validated' });
    expect(await decide({ revision: 5 })).toEqual({ outcome: 'stale' });
    expect(await decide({ goalkeeperId: 'nobody' })).toEqual({ outcome: 'not_a_goalkeeper' });
  });
});

describe('DecideValidation and reputation (admin spec 030, FR-012)', () => {
  it('a goalkeeper who already earned the reputation is verified right after being validated', async () => {
    h.check('gk-1', 'bc-1');
    const evaluated: string[] = [];
    const handler = new DecideValidationCommandHandler({ ...h.deps, reputation: { evaluate: async (goalkeeperId: string) => void evaluated.push(goalkeeperId) } });

    await handler.handle(new DecideValidationCommand({ staffUserId: 'staff-1', goalkeeperId: 'gk-1', revision: 0, decision: 'approve' }));

    expect(evaluated).toEqual(['gk-1']);
  });

  it('nothing is evaluated when the validation does not happen', async () => {
    const evaluated: string[] = [];
    const handler = new DecideValidationCommandHandler({ ...h.deps, reputation: { evaluate: async (goalkeeperId: string) => void evaluated.push(goalkeeperId) } });

    await handler.handle(new DecideValidationCommand({ staffUserId: 'staff-1', goalkeeperId: 'gk-1', revision: 0, decision: 'reject', reason: 'Ilegible' }));

    expect(evaluated).toEqual([]);
  });
});
