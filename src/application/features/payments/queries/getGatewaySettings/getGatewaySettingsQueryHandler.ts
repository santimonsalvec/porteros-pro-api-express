import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { ICountryLookup } from '../../../goalkeeperRequests/common/ports.js';
import { gatewayCredentialsPresent, toGatewaySettingsResponse } from '../../common/gatewaySettingsResponse.js';
import type { IPaymentGatewaySettingsRepository, IPaymentSecrets } from '../../common/ports.js';
import { GetGatewaySettingsQuery, type GetGatewaySettingsResult } from './getGatewaySettingsQuery.js';

export class GetGatewaySettingsQueryHandler implements IQueryHandler<GetGatewaySettingsQuery, GetGatewaySettingsResult> {
  constructor(
    private readonly settingsRepository: IPaymentGatewaySettingsRepository,
    private readonly secrets: IPaymentSecrets,
    private readonly countryLookup: ICountryLookup,
  ) {}

  async handle(query: GetGatewaySettingsQuery): Promise<GetGatewaySettingsResult> {
    const settings = await this.settingsRepository.getByCountry(query.countryId);
    if (!settings) return { outcome: 'not_found' };
    const credentialsPresent = await gatewayCredentialsPresent({ secrets: this.secrets, countryLookup: this.countryLookup }, settings);
    return { outcome: 'success', settings: toGatewaySettingsResponse(settings, credentialsPresent) };
  }
}
