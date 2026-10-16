import type { ICommandHandler } from '../../../../common/mediator/types.js';
import type { IIdGenerator } from '../../../auth/common/ports.js';
import { amountLimitIssues } from '../../../../../domain/pricing/adminLimits.js';
import { tierIssues } from '../../../../../domain/pricing/tier.js';
import { fieldErrorsOf } from '../../common/fieldErrors.js';
import { checkWriteTarget, type PricingGeographyDependencies } from '../../common/pricingGeography.js';
import type { IRentalRateAdmin } from '../../common/ports.js';
import { CreateRentalRateCommand, type CreateRentalRateResult } from './createRentalRateCommand.js';

export class CreateRentalRateCommandHandler implements ICommandHandler<CreateRentalRateCommand, CreateRentalRateResult> {
  constructor(private readonly deps: PricingGeographyDependencies & { rentalRates: IRentalRateAdmin; ids: IIdGenerator }) {}

  async handle({ input }: CreateRentalRateCommand): Promise<CreateRentalRateResult> {
    const issues = [...tierIssues(input.modality), ...amountLimitIssues('amount', input.amount)];
    if (issues.length > 0) return { outcome: 'invalid', fieldErrors: fieldErrorsOf(issues) };

    const failure = await checkWriteTarget(this.deps, input.scope, input.refId);
    if (failure) return failure;

    const rateId = this.deps.ids.newId();
    const created = await this.deps.rentalRates.create({ id: rateId, ...input });
    return created.outcome === 'created' ? { outcome: 'saved', rateId } : created;
  }
}
