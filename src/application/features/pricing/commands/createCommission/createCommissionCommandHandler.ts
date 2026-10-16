import type { ICommandHandler } from '../../../../common/mediator/types.js';
import type { IIdGenerator } from '../../../auth/common/ports.js';
import { amountLimitIssues } from '../../../../../domain/pricing/adminLimits.js';
import { tierIssues } from '../../../../../domain/pricing/tier.js';
import { fieldErrorsOf } from '../../common/fieldErrors.js';
import { checkWriteTarget, type PricingGeographyDependencies } from '../../common/pricingGeography.js';
import type { ICommissionAdmin } from '../../common/ports.js';
import { CreateCommissionCommand, type CreateCommissionResult } from './createCommissionCommand.js';

export class CreateCommissionCommandHandler implements ICommandHandler<CreateCommissionCommand, CreateCommissionResult> {
  constructor(private readonly deps: PricingGeographyDependencies & { commissions: ICommissionAdmin; ids: IIdGenerator }) {}

  async handle({ input }: CreateCommissionCommand): Promise<CreateCommissionResult> {
    const issues = [...tierIssues(input.modality), ...amountLimitIssues('amount', input.amount)];
    if (issues.length > 0) return { outcome: 'invalid', fieldErrors: fieldErrorsOf(issues) };

    const failure = await checkWriteTarget(this.deps, input.scope, input.refId);
    if (failure) return failure;

    const commissionId = this.deps.ids.newId();
    const created = await this.deps.commissions.create({ id: commissionId, ...input });
    return created.outcome === 'created' ? { outcome: 'saved', commissionId } : created;
  }
}
