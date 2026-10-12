import type { ICommandHandler } from '../../../../common/mediator/types.js';
import { amountLimitIssues } from '../../../../../domain/pricing/adminLimits.js';
import { fieldErrorsOf } from '../../common/fieldErrors.js';
import type { IRentalRateAdmin } from '../../common/ports.js';
import { UpdateRentalRateCommand, type UpdatePriceResult } from './updateRentalRateCommand.js';

export class UpdateRentalRateCommandHandler implements ICommandHandler<UpdateRentalRateCommand, UpdatePriceResult> {
  constructor(private readonly deps: { rentalRates: IRentalRateAdmin }) {}

  async handle({ rateId, revision, amount }: UpdateRentalRateCommand): Promise<UpdatePriceResult> {
    const issues = amountLimitIssues('amount', amount);
    if (issues.length > 0) return { outcome: 'invalid', fieldErrors: fieldErrorsOf(issues) };
    if (!(await this.deps.rentalRates.getById(rateId))) return { outcome: 'not_found' };
    const result = await this.deps.rentalRates.updateAmount(rateId, revision, amount);
    return result === 'saved' ? { outcome: 'saved', rateId } : { outcome: 'stale' };
  }
}
