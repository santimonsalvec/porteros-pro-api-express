import type { ICommandHandler } from '../../../../common/mediator/types.js';
import type { IUnverifiedDiscountRepository } from '../../common/ports.js';
import { unverifiedFieldErrors } from '../../common/unverifiedDiscountRules.js';
import { UpdateUnverifiedDiscountCommand, type UpdateUnverifiedDiscountResult } from './updateUnverifiedDiscountCommand.js';

export class UpdateUnverifiedDiscountCommandHandler implements ICommandHandler<UpdateUnverifiedDiscountCommand, UpdateUnverifiedDiscountResult> {
  constructor(private readonly deps: { discounts: IUnverifiedDiscountRepository }) {}

  async handle({ id, revision, fields }: UpdateUnverifiedDiscountCommand): Promise<UpdateUnverifiedDiscountResult> {
    const fieldErrors = unverifiedFieldErrors(fields);
    if (fieldErrors) return { outcome: 'invalid', fieldErrors };
    if (!(await this.deps.discounts.getById(id))) return { outcome: 'not_found' };
    return (await this.deps.discounts.update(id, revision, fields)) === 'saved' ? { outcome: 'saved', id } : { outcome: 'stale' };
  }
}
