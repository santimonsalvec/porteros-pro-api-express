import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { ICountryLookup } from '../../../goalkeeperRequests/common/ports.js';
import { toInvoicingSettingsResponse } from '../../commands/setInvoicingSettings/setInvoicingSettingsCommandHandler.js';
import type { IInvoicingSecrets, IInvoicingSettingsRepository } from '../../common/ports.js';
import { GetInvoicingSettingsQuery, type GetInvoicingSettingsResult } from './getInvoicingSettingsQuery.js';

export class GetInvoicingSettingsQueryHandler implements IQueryHandler<GetInvoicingSettingsQuery, GetInvoicingSettingsResult> {
  constructor(
    private readonly repository: IInvoicingSettingsRepository,
    private readonly secrets: IInvoicingSecrets,
    private readonly countryLookup: ICountryLookup,
  ) {}

  async handle(query: GetInvoicingSettingsQuery): Promise<GetInvoicingSettingsResult> {
    const settings = await this.repository.getByCountry(query.countryId);
    if (!settings) return { outcome: 'not_found' };
    const country = await this.countryLookup.getById(query.countryId);
    const credentialsPresent = country ? this.secrets.forProvider(settings.provider, country.countryCode) !== null : false;
    return { outcome: 'success', settings: toInvoicingSettingsResponse(settings, credentialsPresent) };
  }
}
