import type { ICommandHandler } from '../../../../common/mediator/types.js';
import { revokeValidation, VettingTransitionError } from '../../../../../domain/goalkeepers/vetting.js';
import { reasonOrError, recordDecision, type VettingDependencies } from '../../common/vettingDependencies.js';
import { RevokeValidationCommand, type RevokeValidationResult } from './revokeValidationCommand.js';

/** Bookings already assigned are not touched (clarification Q3 of specify); reputation stays blocked. */
export class RevokeValidationCommandHandler implements ICommandHandler<RevokeValidationCommand, RevokeValidationResult> {
  constructor(private readonly deps: Pick<VettingDependencies, 'profiles' | 'log' | 'idGenerator' | 'clock'>) {}

  async handle(command: RevokeValidationCommand): Promise<RevokeValidationResult> {
    const { staffUserId, goalkeeperId, revision } = command.input;
    const checked = reasonOrError(command.input.reason);
    if ('fieldErrors' in checked) return { outcome: 'invalid_fields', fieldErrors: checked.fieldErrors };
    const profile = await this.deps.profiles.getByUserId(goalkeeperId);
    if (!profile) return { outcome: 'not_a_goalkeeper' };
    if (profile.vetting.revision !== revision) return { outcome: 'stale' };
    let next;
    try {
      next = revokeValidation(profile.vetting);
    } catch (error) {
      if (error instanceof VettingTransitionError) return { outcome: 'not_validated' };
      throw error;
    }
    if ((await this.deps.profiles.updateVetting(goalkeeperId, revision, next)) === 'stale') return { outcome: 'stale' };
    await recordDecision(this.deps, { goalkeeperId, at: this.deps.clock.now(), actor: { kind: 'staff', userId: staffUserId }, action: 'validation.revoked', reason: checked.reason });
    return { outcome: 'revoked' };
  }
}
