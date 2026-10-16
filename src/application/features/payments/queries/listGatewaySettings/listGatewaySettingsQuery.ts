import { IQuery } from '../../../../common/mediator/types.js';
import type { GatewaySettingsResponse } from '../../common/gatewaySettingsResponse.js';

/** One market of the country: its override, or `null` when it uses the country's. */
export interface MarketGatewayRow {
  marketId: string;
  marketName: string;
  settings: GatewaySettingsResponse | null;
}

export type ListGatewaySettingsResult =
  | { outcome: 'success'; country: GatewaySettingsResponse | null; markets: MarketGatewayRow[] }
  | { outcome: 'country_not_found' };

/** A country's deposit settings and each of its markets with its override, if any (spec 031, contract E). */
export class ListGatewaySettingsQuery extends IQuery<ListGatewaySettingsResult> {
  constructor(public readonly countryId: string) {
    super();
  }
}
