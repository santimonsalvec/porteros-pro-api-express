import type { ICommandHandler } from '../../../../common/mediator/types.js';
import type { ICityRepository } from '../../../locations/common/ports.js';
import { billingFieldErrors, normalizedBilling, type BillingData } from '../../../../../domain/goalkeepers/billing.js';
import { isInvoiceableCity } from '../../common/billingCity.js';
import { findActiveGoalkeeperProfile } from '../../common/findActiveGoalkeeperProfile.js';
import { toActiveGoalkeeperResponse } from '../../common/goalkeeperRegistrationResponse.js';
import type { IGoalkeeperProfileRepository, IGoalkeeperRegistrationRepository } from '../../common/ports.js';
import { UpdateGoalkeeperBillingCommand, type UpdateGoalkeeperBillingResult } from './updateGoalkeeperBillingCommand.js';

export class UpdateGoalkeeperBillingCommandHandler implements ICommandHandler<UpdateGoalkeeperBillingCommand, UpdateGoalkeeperBillingResult> {
  constructor(
    private readonly goalkeeperProfileRepository: IGoalkeeperProfileRepository,
    private readonly goalkeeperRegistrationRepository: IGoalkeeperRegistrationRepository,
    private readonly cityRepository: Pick<ICityRepository, 'getById'>,
  ) {}

  async handle({ userId, fields }: UpdateGoalkeeperBillingCommand): Promise<UpdateGoalkeeperBillingResult> {
    const lookup = await findActiveGoalkeeperProfile(this.goalkeeperProfileRepository, this.goalkeeperRegistrationRepository, userId);
    if (!lookup.found) return { outcome: lookup.outcome };

    const fieldErrors = billingFieldErrors(fields);
    if (Object.keys(fieldErrors).length > 0) return { outcome: 'validation_failed', fieldErrors };
    if (!(await isInvoiceableCity(this.cityRepository, fields.cityId))) return { outcome: 'invalid_city' };

    const updated = await this.goalkeeperProfileRepository.updateBilling(userId, normalizedBilling(fields) as BillingData);
    // The profile is never deleted, so `null` here can only mean it vanished between the lookup and the write.
    if (!updated) return { outcome: 'not_a_goalkeeper' };
    return { outcome: 'success', goalkeeper: toActiveGoalkeeperResponse(updated) };
  }
}
