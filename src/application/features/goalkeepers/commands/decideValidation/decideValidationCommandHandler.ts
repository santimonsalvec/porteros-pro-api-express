import type { ICommandHandler } from '../../../../common/mediator/types.js';
import { canApproveValidation } from '../../../../../domain/goalkeepers/backgroundCheck.js';
import { approveValidation, grantVerification, rejectValidation, type Verification } from '../../../../../domain/goalkeepers/vetting.js';
import { resolveVerification, type VerificationSupport } from '../../common/verificationInput.js';
import { reasonOrError, recordDecision, type VettingDependencies } from '../../common/vettingDependencies.js';
import { DecideValidationCommand, type DecideValidationResult } from './decideValidationCommand.js';

/**
 * Validates only when FR-004 allows it; the decision is stored at the revision the administrator
 * read, recorded in the history and then told to the goalkeeper (research §11).
 */
export class DecideValidationCommandHandler implements ICommandHandler<DecideValidationCommand, DecideValidationResult> {
  constructor(
    private readonly deps: VettingDependencies &
      VerificationSupport & {
        /** Verifies by reputation a goalkeeper who already earned it (research §7). */
        reputation?: { evaluate(goalkeeperId: string): Promise<unknown> };
      },
  ) {}

  async handle(command: DecideValidationCommand): Promise<DecideValidationResult> {
    const { staffUserId, goalkeeperId, revision, decision } = command.input;
    const now = this.deps.clock.now();
    const profile = await this.deps.profiles.getByUserId(goalkeeperId);
    if (!profile) return { outcome: 'not_a_goalkeeper' };
    if (profile.vetting.revision !== revision) return { outcome: 'stale' };
    if (profile.vetting.validation === 'validated') return { outcome: 'already_validated' };

    if (decision === 'reject') {
      const checked = reasonOrError(command.input.reason);
      if ('fieldErrors' in checked) return { outcome: 'invalid_fields', fieldErrors: checked.fieldErrors };
      const next = rejectValidation(profile.vetting, staffUserId, now, checked.reason);
      if ((await this.deps.profiles.updateVetting(goalkeeperId, revision, next)) === 'stale') return { outcome: 'stale' };
      const entry = await recordDecision(this.deps, { goalkeeperId, at: now, actor: { kind: 'staff', userId: staffUserId }, action: 'validation.rejected', reason: checked.reason });
      await this.deps.notifier.validationRejected(goalkeeperId, entry.id, checked.reason);
      return { outcome: 'rejected' };
    }

    const ready = canApproveValidation(profile, await this.deps.checks.listForGoalkeeper(goalkeeperId), now);
    if (!ready.ok) return { outcome: 'not_ready', missing: ready.missing };

    // FR-011: a verification in the same step is checked before anything is written.
    let verification: Verification | null = null;
    let failedPractice: { evaluatedOn: string; notes: string | null } | null = null;
    if (command.input.verification) {
      const resolved = await resolveVerification(this.deps, goalkeeperId, staffUserId, command.input.verification, now);
      if (resolved.kind === 'invalid_referrer' || resolved.kind === 'invalid_evidence') return { outcome: resolved.kind };
      if (resolved.kind === 'invalid_fields') return { outcome: 'invalid_fields', fieldErrors: resolved.fieldErrors };
      if (resolved.kind === 'grant') verification = resolved.verification;
      else failedPractice = resolved.details;
    }

    const validated = approveValidation(profile.vetting, staffUserId, now);
    // One write, one revision: validated and verified together.
    const next = verification ? { ...grantVerification(validated, verification), revision: validated.revision } : validated;
    if ((await this.deps.profiles.updateVetting(goalkeeperId, revision, next)) === 'stale') return { outcome: 'stale' };
    const actor = { kind: 'staff' as const, userId: staffUserId };
    const entry = await recordDecision(this.deps, { goalkeeperId, at: now, actor, action: 'validation.approved' });
    await this.deps.notifier.validated(goalkeeperId, entry.id);
    if (verification) {
      const granted = await recordDecision(this.deps, { goalkeeperId, at: now, actor, action: 'verification.granted', method: verification.method, details: { ...verification.details } });
      await this.deps.notifier.verified(goalkeeperId, granted.id);
    }
    if (failedPractice) await recordDecision(this.deps, { goalkeeperId, at: now, actor, action: 'practice.failed', method: 'practice', details: failedPractice });
    // The ratings may already verify them (clarification 4: those before the validation count).
    if (!verification) await this.deps.reputation?.evaluate(goalkeeperId);
    return { outcome: 'approved' };
  }
}
