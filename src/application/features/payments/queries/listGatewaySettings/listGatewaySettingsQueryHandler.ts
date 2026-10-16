import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { ICountryLookup } from '../../../goalkeeperRequests/common/ports.js';
import type { IAdminMarketRepository } from '../../../markets/common/ports.js';
import { gatewayCredentialsPresent, toGatewaySettingsResponse } from '../../common/gatewaySettingsResponse.js';
import type { IPaymentGatewaySettingsRepository, IPaymentSecrets } from '../../common/ports.js';
import { ListGatewaySettingsQuery, type ListGatewaySettingsResult } from './listGatewaySettingsQuery.js';

export class ListGatewaySettingsQueryHandler implements IQueryHandler<ListGatewaySettingsQuery, ListGatewaySettingsResult> {
  constructor(
    private readonly deps: {
      settingsRepository: IPaymentGatewaySettingsRepository;
      secrets: IPaymentSecrets;
      countryLookup: ICountryLookup;
      markets: Pick<IAdminMarketRepository, 'listByCountry'>;
    },
  ) {}

  async handle({ countryId }: ListGatewaySettingsQuery): Promise<ListGatewaySettingsResult> {
    if (!(await this.deps.countryLookup.getById(countryId))) return { outcome: 'country_not_found' };
    const [all, markets] = await Promise.all([this.deps.settingsRepository.listForCountry(countryId), this.deps.markets.listByCountry(countryId)]);
    const view = async (settings: (typeof all)[number]) =>
      toGatewaySettingsResponse(settings, await gatewayCredentialsPresent({ secrets: this.deps.secrets, countryLookup: this.deps.countryLookup }, settings));
    const country = all.find((settings) => settings.scope === 'country');
    const overrides = new Map(all.filter((settings) => settings.scope === 'market').map((settings) => [settings.refId, settings]));
    return {
      outcome: 'success',
      country: country ? await view(country) : null,
      markets: await Promise.all(
        markets.map(async (market) => {
          const override = overrides.get(market.id);
          return { marketId: market.id, marketName: market.name, settings: override ? await view(override) : null };
        }),
      ),
    };
  }
}
