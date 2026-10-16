import { IQuery } from '../../../../common/mediator/types.js';
import type { EffectiveMarketRules, MarketRuleFields } from '../../common/bookingRules.js';

export interface MarketBookingSettingsView {
  marketId: string;
  marketName: string;
  countryId: string | null;
  countryName: string | null;
  currency: string | null;
  /** The market's own values; `null` = inherits. */
  own: MarketRuleFields;
  country: MarketRuleFields;
  /** What applies here, and from which level (FR-006; spec 031, FR-014). */
  effective: EffectiveMarketRules;
  invalid: boolean;
  revision: number | null;
}

export type GetMarketBookingSettingsResult =
  | { outcome: 'ok'; settings: MarketBookingSettingsView }
  | { outcome: 'not_found' };

export class GetMarketBookingSettingsQuery extends IQuery<GetMarketBookingSettingsResult> {
  constructor(readonly marketId: string) {
    super();
  }
}
