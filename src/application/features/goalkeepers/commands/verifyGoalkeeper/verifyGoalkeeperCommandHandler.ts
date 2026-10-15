import type { ICommandHandler } from '../../../../common/mediator/types.js';
import { grantVerification } from '../../../../../domain/goalkeepers/vetting.js';
import { resolveVerification, type VerificationSupport } from '../../common/verificationInput.js';
import { recordDecision, type VettingDependencies } from '../../common/vettingDependencies.js';
import { VerifyGoalkeeperCommand, type VerifyGoalkeeperResult } from './verifyGoalkeeperCommand.js';

export class VerifyGoalkeeperCommandHandler implements ICommandHandler<VerifyGoalkeeperCommand, VerifyGoalkeeperResult> {
  constructor(private readonly deps: VettingDependencies & VerificationSupport) {}

  async handle(command: VerifyGoalkeeperCommand): Promise<VerifyGoalkeeperResult> {
    const { staffUserId, goalkeeperId, revision, verification } = command.input;
    const now = this.deps.clock.now();
    const profile = await this.deps.profiles.getByUserId(goalkeeperId);
    if (!profile) return { outcome: 'not_a_goalkeeper' };
    if (profile.vetting.revision !== revision) return { outcome: 'stale' };
    if (profile.tier === 'unvalidated') return { outcome: 'not_validated' };
    if (profile.tier === 'verified') return { outcome: 'already_verified' };

    const resolved = await resolveVerification(this.deps, goalkeeperId, staffUserId, verification, now);
    const actor = { kind: 'staff' as const, userId: staffUserId };
    switch (resolved.kind) {
      case 'invalid_referrer':
      case 'invalid_evidence':
        return { outcome: resolved.kind };
      case 'invalid_fields':
        return { outcome: 'invalid_fields', fieldErrors: resolved.fieldErrors };
      case 'practice_failed':
        await recordDecision(this.deps, { goalkeeperId, at: now, actor, action: 'practice.failed', method: 'practice', details: resolved.details });
        return { outcome: 'practice_failed' };
      case 'grant': {
        const next = grantVerification(profile.vetting, resolved.verification);
        if ((await this.deps.profiles.updateVetting(goalkeeperId, revision, next)) === 'stale') return { outcome: 'stale' };
        const entry = await recordDecision(this.deps, {
          goalkeeperId,
          at: now,
          actor,
          action: 'verification.granted',
          method: resolved.verification.method,
          details: { ...resolved.verification.details },
        });
        await this.deps.notifier.verified(goalkeeperId, entry.id);
        return { outcome: 'verified' };
      }
    }
  }
}
