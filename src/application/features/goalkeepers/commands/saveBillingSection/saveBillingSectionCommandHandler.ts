import type { ICommandHandler } from '../../../../common/mediator/types.js';
import type { IIdGenerator } from '../../../auth/common/ports.js';
import type { ICityRepository } from '../../../locations/common/ports.js';
import { billingFieldErrors } from '../../../../../domain/goalkeepers/billing.js';
import { GoalkeeperRegistration } from '../../../../../domain/goalkeepers/goalkeeperRegistration.js';
import { isInvoiceableCity } from '../../common/billingCity.js';
import { toGoalkeeperRegistrationResponse } from '../../common/goalkeeperRegistrationResponse.js';
import type { IGoalkeeperRegistrationRepository } from '../../common/ports.js';
import { SaveBillingSectionCommand, type SaveBillingSectionResult } from './saveBillingSectionCommand.js';

export class SaveBillingSectionCommandHandler implements ICommandHandler<SaveBillingSectionCommand, SaveBillingSectionResult> {
  constructor(
    private readonly goalkeeperRegistrationRepository: IGoalkeeperRegistrationRepository,
    private readonly cityRepository: Pick<ICityRepository, 'getById'>,
    private readonly idGenerator: IIdGenerator,
  ) {}

  async handle({ userId, fields }: SaveBillingSectionCommand): Promise<SaveBillingSectionResult> {
    let registration = await this.goalkeeperRegistrationRepository.getByUserId(userId);
    if (registration?.status === 'active') return { outcome: 'already_active' };

    const fieldErrors = billingFieldErrors(fields);
    if (Object.keys(fieldErrors).length > 0) return { outcome: 'validation_failed', fieldErrors };
    if (fields.cityId && !(await isInvoiceableCity(this.cityRepository, fields.cityId))) return { outcome: 'invalid_city' };

    const isNew = registration === null;
    registration ??= GoalkeeperRegistration.createEmpty(this.idGenerator.newId(), userId);
    registration.saveBilling(fields);
    if (isNew) await this.goalkeeperRegistrationRepository.add(registration);
    else await this.goalkeeperRegistrationRepository.update(registration);

    return { outcome: 'success', registration: toGoalkeeperRegistrationResponse(registration) };
  }
}
