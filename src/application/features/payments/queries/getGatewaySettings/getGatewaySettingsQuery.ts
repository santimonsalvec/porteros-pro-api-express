import { IQuery } from '../../../../common/mediator/types.js';
import type { GatewaySettingsResponse } from '../../common/gatewaySettingsResponse.js';

export type GetGatewaySettingsResult = { outcome: 'success'; settings: GatewaySettingsResponse } | { outcome: 'not_found' };

export class GetGatewaySettingsQuery extends IQuery<GetGatewaySettingsResult> {
  constructor(public readonly countryId: string) {
    super();
  }
}
