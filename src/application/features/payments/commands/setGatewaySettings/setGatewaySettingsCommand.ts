import { ICommand } from '../../../../common/mediator/types.js';
import type { GatewayCosts, GatewayPublicConfig, GatewayScope } from '../../../../../domain/payments/gatewaySettings.js';
import type { GatewaySettingsResponse } from '../../common/gatewaySettingsResponse.js';

export type SetGatewaySettingsResult =
  | { outcome: 'saved'; settings: GatewaySettingsResponse }
  | { outcome: 'country_not_found' }
  | { outcome: 'market_not_found' }
  /** Someone saved since `revision` was read, or a create met settings that exist (admin spec 007). */
  | { outcome: 'stale' }
  /** Each problem keyed by its field (`gateway`, `publicConfig.publicKey`, `amounts`, …). */
  | { outcome: 'invalid'; fieldErrors: Record<string, string> };

/**
 * An administrator sets a country's deposit gateway, public configuration, costs and amounts
 * (contracts §7). In-flight deposits keep the gateway they started with. `revision` is the one read
 * (`null` creates the country's first settings), so two people never overwrite each other (admin spec 007, FR-025).
 */
export class SetGatewaySettingsCommand extends ICommand<SetGatewaySettingsResult> {
  constructor(
    public readonly adminUserId: string,
    /** A country's settings, or a market's override in its country's currency (spec 031). */
    public readonly scope: GatewayScope,
    public readonly refId: string,
    public readonly gateway: string,
    public readonly publicConfig: GatewayPublicConfig,
    public readonly costs: GatewayCosts,
    public readonly amounts: number[],
    public readonly revision: number | null,
  ) {
    super();
  }
}
