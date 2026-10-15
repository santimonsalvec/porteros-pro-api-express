import { beforeEach, describe, expect, it } from 'vitest';
import { ReputationVerifier } from '../../../../../src/application/features/goalkeepers/common/reputationVerifier.js';
import { PENDING_VETTING, revokeVerification, vettingTier } from '../../../../../src/domain/goalkeepers/vetting.js';
import { VALIDATED_VETTING, VERIFIED_VETTING } from '../../../../fixtures/vettingFixtures.js';
import { VETTING_NOW, VettingHarness } from './vettingHarness.js';

let h: VettingHarness;
let summary: { count: number; average: number | null };

const verifier = () => new ReputationVerifier({ ...h.deps, ratings: { summaryForGoalkeeper: async () => summary } });

beforeEach(() => {
  h = new VettingHarness();
  summary = { count: 5, average: 4.6 };
});

describe('ReputationVerifier (admin spec 030, FR-012, FR-013)', () => {
  it('verifies a validated goalkeeper by reputation, as the system, and tells them', async () => {
    h.goalkeeper('gk-1', VALIDATED_VETTING);

    expect(await verifier().evaluate('gk-1')).toBe('verified');

    const vetting = await h.vettingOf('gk-1');
    expect(vetting.verification).toEqual({ method: 'reputation', at: VETTING_NOW, by: { kind: 'system' }, details: { ratingCount: 5, ratingAverage: 4.6 } });
    expect(h.log.entries).toEqual([expect.objectContaining({ action: 'verification.granted', method: 'reputation', actor: { kind: 'system' } })]);
    expect(h.notifier.sent).toEqual([expect.objectContaining({ kind: 'verified', goalkeeperId: 'gk-1' })]);
  });

  it('does nothing below the bar', async () => {
    h.goalkeeper('gk-1', VALIDATED_VETTING);
    summary = { count: 5, average: 4 };

    expect(await verifier().evaluate('gk-1')).toBe('not_eligible');
    expect(vettingTier(await h.vettingOf('gk-1'))).toBe('validated');
  });

  it.each([
    ['an unvalidated goalkeeper', PENDING_VETTING],
    ['one already verified', VERIFIED_VETTING],
    ['one whose seal an administrator revoked', revokeVerification(VERIFIED_VETTING)],
  ])('never verifies %s', async (_label, vetting) => {
    h.goalkeeper('gk-1', vetting);

    expect(await verifier().evaluate('gk-1')).toBe('not_eligible');
    expect(h.log.entries).toHaveLength(0);
    expect(h.notifier.sent).toHaveLength(0);
  });

  it('two evaluations at once verify once', async () => {
    h.goalkeeper('gk-1', VALIDATED_VETTING);

    const results = await Promise.all([verifier().evaluate('gk-1'), verifier().evaluate('gk-1')]);

    expect(results.filter((result) => result === 'verified')).toHaveLength(1);
    expect(h.log.entries).toHaveLength(1);
  });

  it('is not about goalkeepers who do not exist', async () => {
    expect(await verifier().evaluate('nobody')).toBe('not_eligible');
  });
});
