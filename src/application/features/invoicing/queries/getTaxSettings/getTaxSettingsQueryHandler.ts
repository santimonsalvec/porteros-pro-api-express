import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { ITaxSettingsRepository } from '../../../wallet/common/ports.js';
import { toTaxSettingsResponse } from '../../commands/setTaxSettings/setTaxSettingsCommandHandler.js';
import { GetTaxSettingsQuery, type GetTaxSettingsResult } from './getTaxSettingsQuery.js';

export class GetTaxSettingsQueryHandler implements IQueryHandler<GetTaxSettingsQuery, GetTaxSettingsResult> {
  constructor(private readonly repository: ITaxSettingsRepository) {}

  async handle(query: GetTaxSettingsQuery): Promise<GetTaxSettingsResult> {
    const setting = await this.repository.getByCountry(query.countryId);
    return setting ? { outcome: 'success', settings: toTaxSettingsResponse(setting) } : { outcome: 'not_found' };
  }
}
