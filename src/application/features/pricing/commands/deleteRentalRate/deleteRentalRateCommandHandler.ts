import type { ICommandHandler } from '../../../../common/mediator/types.js';
import type { IRentalRateAdmin } from '../../common/ports.js';
import { DeleteRentalRateCommand, type DeletePriceResult } from './deleteRentalRateCommand.js';

export class DeleteRentalRateCommandHandler implements ICommandHandler<DeleteRentalRateCommand, DeletePriceResult> {
  constructor(private readonly deps: { rentalRates: IRentalRateAdmin }) {}

  async handle({ rateId }: DeleteRentalRateCommand): Promise<DeletePriceResult> {
    return (await this.deps.rentalRates.delete(rateId)) ? { outcome: 'deleted' } : { outcome: 'not_found' };
  }
}
