import type { IQueryHandler } from '../../../../common/mediator/types.js';
import { toGatewaySettingsResponse } from '../../common/gatewaySettingsResponse.js';
import type { IPaymentGatewaySettingsRepository } from '../../common/ports.js';
import { GetGatewaySettingsQuery, type GetGatewaySettingsResult } from './getGatewaySettingsQuery.js';

export class GetGatewaySettingsQueryHandler implements IQueryHandler<GetGatewaySettingsQuery, GetGatewaySettingsResult> {
  constructor(private readonly settingsRepository: IPaymentGatewaySettingsRepository) {}

  async handle(query: GetGatewaySettingsQuery): Promise<GetGatewaySettingsResult> {
    const settings = await this.settingsRepository.getByCountry(query.countryId);
    return settings ? { outcome: 'success', settings: toGatewaySettingsResponse(settings) } : { outcome: 'not_found' };
  }
}
