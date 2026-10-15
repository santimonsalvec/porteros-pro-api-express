import { qualifiesForReputation } from '../../../../domain/goalkeepers/reputation.js';
import { grantVerification } from '../../../../domain/goalkeepers/vetting.js';
import type { IRatingRepository } from '../../ratings/common/ports.js';
import { recordDecision, type VettingDependencies } from './vettingDependencies.js';

export type ReputationOutcome = 'verified' | 'not_eligible';

/**
 * Verifies a goalkeeper on their own once clients rated at least 5 services with an average above
 * 4.0 (admin spec 030, FR-012, research §7): only a validated goalkeeper without the seal whose seal
 * no administrator revoked. The write is at the revision read, so two evaluations at once verify
 * once. Run after a client rates and after a validation.
 */
export class ReputationVerifier {
  constructor(private readonly deps: VettingDependencies & { ratings: Pick<IRatingRepository, 'summaryForGoalkeeper'> }) {}

  async evaluate(goalkeeperId: string): Promise<ReputationOutcome> {
    const profile = await this.deps.profiles.getByUserId(goalkeeperId);
    if (!profile || profile.tier !== 'validated' || profile.vetting.autoVerificationBlocked) return 'not_eligible';
    const summary = await this.deps.ratings.summaryForGoalkeeper(goalkeeperId);
    if (!qualifiesForReputation(summary)) return 'not_eligible';

    const now = this.deps.clock.now();
    const details = { ratingCount: summary.count, ratingAverage: summary.average! };
    const next = grantVerification(profile.vetting, { method: 'reputation', at: now, by: { kind: 'system' }, details });
    if ((await this.deps.profiles.updateVetting(goalkeeperId, profile.vetting.revision, next)) === 'stale') return 'not_eligible';
    const entry = await recordDecision(this.deps, { goalkeeperId, at: now, actor: { kind: 'system' }, action: 'verification.granted', method: 'reputation', details });
    await this.deps.notifier.verified(goalkeeperId, entry.id);
    return 'verified';
  }
}
