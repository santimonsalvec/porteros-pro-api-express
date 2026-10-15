import type { ICommandHandler } from '../../../../common/mediator/types.js';
import type { IUnverifiedDiscountRepository } from '../../common/ports.js';
import { DeleteUnverifiedDiscountCommand, type DeleteUnverifiedDiscountResult } from './deleteUnverifiedDiscountCommand.js';

export class DeleteUnverifiedDiscountCommandHandler implements ICommandHandler<DeleteUnverifiedDiscountCommand, DeleteUnverifiedDiscountResult> {
  constructor(private readonly deps: { discounts: IUnverifiedDiscountRepository }) {}

  async handle({ id, revision }: DeleteUnverifiedDiscountCommand): Promise<DeleteUnverifiedDiscountResult> {
    return { outcome: await this.deps.discounts.delete(id, revision) };
  }
}
