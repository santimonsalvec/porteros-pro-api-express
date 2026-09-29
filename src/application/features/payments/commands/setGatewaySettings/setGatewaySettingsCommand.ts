import { ICommand } from '../../../../common/mediator/types.js';
import type { GatewayCosts, GatewayPublicConfig } from '../../../../../domain/payments/gatewaySettings.js';
import type { GatewaySettingsResponse } from '../../common/gatewaySettingsResponse.js';

export type SetGatewaySettingsResult =
  | { outcome: 'saved'; settings: GatewaySettingsResponse }
  | { outcome: 'country_not_found' }
  /** Each problem keyed by its field (`gateway`, `publicConfig.publicKey`, `amounts`, …). */
  | { outcome: 'invalid'; fieldErrors: Record<string, string> };

/**
 * An administrator sets a country's top-up gateway, public configuration, costs and amounts
 * (contracts §7). In-flight top-ups keep the gateway they started with.
 */
export class SetGatewaySettingsCommand extends ICommand<SetGatewaySettingsResult> {
  constructor(
    public readonly adminUserId: string,
    public readonly countryId: string,
    public readonly gateway: string,
    public readonly publicConfig: GatewayPublicConfig,
    public readonly costs: GatewayCosts,
    public readonly amounts: number[],
  ) {
    super();
  }
}
