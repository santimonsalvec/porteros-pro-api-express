import { IQuery } from '../../../../common/mediator/types.js';
import type { GatewayScope } from '../../../../../domain/payments/gatewaySettings.js';
import type { GatewaySettingsResponse } from '../../common/gatewaySettingsResponse.js';

export type GetGatewaySettingsResult = { outcome: 'success'; settings: GatewaySettingsResponse } | { outcome: 'not_found' };

/** A country's settings, or a market's override (spec 031). */
export class GetGatewaySettingsQuery extends IQuery<GetGatewaySettingsResult> {
  constructor(
    public readonly scope: GatewayScope,
    public readonly refId: string,
  ) {
    super();
  }
}
