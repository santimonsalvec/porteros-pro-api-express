import type { ICommandHandler } from '../../../../common/mediator/types.js';
import type { IIdGenerator } from '../../../auth/common/ports.js';
import type { IUnverifiedDiscountRepository } from '../../common/ports.js';
import { checkWriteTarget, type PricingGeographyDependencies } from '../../common/pricingGeography.js';
import { unverifiedFieldErrors } from '../../common/unverifiedDiscountRules.js';
import { CreateUnverifiedDiscountCommand, type CreateUnverifiedDiscountResult } from './createUnverifiedDiscountCommand.js';

export class CreateUnverifiedDiscountCommandHandler implements ICommandHandler<CreateUnverifiedDiscountCommand, CreateUnverifiedDiscountResult> {
  constructor(private readonly deps: PricingGeographyDependencies & { discounts: IUnverifiedDiscountRepository; ids: IIdGenerator }) {}

  async handle({ input }: CreateUnverifiedDiscountCommand): Promise<CreateUnverifiedDiscountResult> {
    const fieldErrors = unverifiedFieldErrors(input);
    if (fieldErrors) return { outcome: 'invalid', fieldErrors };
    const target = await checkWriteTarget(this.deps, input.scope, input.refId);
    if (target) return target;
    const id = this.deps.ids.newId();
    const created = await this.deps.discounts.create({ id, ...input });
    return created.outcome === 'created' ? { outcome: 'saved', id } : created;
  }
}
