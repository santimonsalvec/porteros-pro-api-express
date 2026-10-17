import type { ICommandHandler } from '../../../../common/mediator/types.js';
import type { IIdGenerator } from '../../../auth/common/ports.js';
import type { IClock } from '../../../../common/clock.js';
import { ADMIN_LIMITS } from '../../../../../domain/pricing/adminLimits.js';
import { ruleIssues } from '../../../../../domain/operatingBalance/commissionRule.js';
import { tierIssues } from '../../../../../domain/pricing/tier.js';
import { fieldErrorsOf } from '../../common/fieldErrors.js';
import { checkWriteTarget, type PricingGeographyDependencies } from '../../common/pricingGeography.js';
import { resolveGoalkeeperTarget, type GoalkeeperTargetDependencies } from '../../common/goalkeeperTarget.js';
import type { ICommissionAdmin } from '../../common/ports.js';
import { CreateCommissionCommand, type CreateCommissionResult } from './createCommissionCommand.js';

export type CreateCommissionDependencies = PricingGeographyDependencies & GoalkeeperTargetDependencies & { commissions: ICommissionAdmin; ids: IIdGenerator; clock: IClock };

export class CreateCommissionCommandHandler implements ICommandHandler<CreateCommissionCommand, CreateCommissionResult> {
  constructor(private readonly deps: CreateCommissionDependencies) {}

  async handle({ input }: CreateCommissionCommand): Promise<CreateCommissionResult> {
    const issues = [...tierIssues(input.modality), ...ruleIssues(input.fixedAmount, input.percentBps, ADMIN_LIMITS.amount)];
    if (issues.length > 0) return { outcome: 'invalid', fieldErrors: fieldErrorsOf(issues) };

    const { scope, refId, modality, fixedAmount, percentBps } = input;
    let countryId: string | null = null;
    let validUntil: Date | null = null;
    if (scope === 'goalkeeper') {
      const target = await resolveGoalkeeperTarget(this.deps, refId, input.validUntilLocal ?? null, this.deps.clock.now());
      if (target.outcome !== 'ok') return target;
      countryId = target.countryId;
      validUntil = target.validUntil;
    } else {
      if (input.validUntilLocal !== undefined && input.validUntilLocal !== null) {
        return { outcome: 'invalid', fieldErrors: { validUntilLocal: 'only_for_goalkeeper' } };
      }
      const failure = await checkWriteTarget(this.deps, scope, refId);
      if (failure) return failure;
    }

    const commissionId = this.deps.ids.newId();
    const created = await this.deps.commissions.create({ id: commissionId, scope, refId, modality, fixedAmount, percentBps, countryId, validUntil });
    return created.outcome === 'created' ? { outcome: 'saved', commissionId } : created;
  }
}
