import type { ICommandHandler } from '../../../../common/mediator/types.js';
import type { ICommissionAdmin } from '../../common/ports.js';
import type { DeletePriceResult } from '../deleteRentalRate/deleteRentalRateCommand.js';
import { DeleteCommissionCommand } from './deleteCommissionCommand.js';

export class DeleteCommissionCommandHandler implements ICommandHandler<DeleteCommissionCommand, DeletePriceResult> {
  constructor(private readonly deps: { commissions: ICommissionAdmin }) {}

  async handle({ commissionId }: DeleteCommissionCommand): Promise<DeletePriceResult> {
    return (await this.deps.commissions.delete(commissionId)) ? { outcome: 'deleted' } : { outcome: 'not_found' };
  }
}
