import type { ICommandHandler } from '../../../../common/mediator/types.js';
import type { IClock } from '../../../../common/clock.js';
import { ADMIN_LIMITS } from '../../../../../domain/pricing/adminLimits.js';
import { ruleIssues } from '../../../../../domain/operatingBalance/commissionRule.js';
import { fieldErrorsOf } from '../../common/fieldErrors.js';
import { resolveGoalkeeperTarget, type GoalkeeperTargetDependencies } from '../../common/goalkeeperTarget.js';
import type { CommissionFields, ICommissionAdmin } from '../../common/ports.js';
import { UpdateCommissionCommand, type UpdateCommissionResult } from './updateCommissionCommand.js';

export class UpdateCommissionCommandHandler implements ICommandHandler<UpdateCommissionCommand, UpdateCommissionResult> {
  constructor(private readonly deps: GoalkeeperTargetDependencies & { commissions: ICommissionAdmin; clock: IClock }) {}

  async handle({ commissionId, revision, input }: UpdateCommissionCommand): Promise<UpdateCommissionResult> {
    const issues = ruleIssues(input.fixedAmount, input.percentBps, ADMIN_LIMITS.amount);
    if (issues.length > 0) return { outcome: 'invalid', fieldErrors: fieldErrorsOf(issues) };
    const current = await this.deps.commissions.getById(commissionId);
    if (!current) return { outcome: 'not_found' };

    const fields: CommissionFields = { fixedAmount: input.fixedAmount, percentBps: input.percentBps };
    if (input.validUntilLocal !== undefined) {
      if (current.scope !== 'goalkeeper') return { outcome: 'invalid', fieldErrors: { validUntilLocal: 'only_for_goalkeeper' } };
      const target = await resolveGoalkeeperTarget(this.deps, current.refId, input.validUntilLocal, this.deps.clock.now());
      if (target.outcome === 'invalid') return target;
      if (target.outcome !== 'ok') return { outcome: 'not_found' };
      fields.validUntil = target.validUntil;
    }
    const result = await this.deps.commissions.update(commissionId, revision, fields);
    return result === 'saved' ? { outcome: 'saved', commissionId } : { outcome: 'stale' };
  }
}
