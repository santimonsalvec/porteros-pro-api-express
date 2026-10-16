import { IQuery } from '../../../../common/mediator/types.js';
import type { MarketStatus } from '../../../../../domain/markets/market.js';
import type { ReadinessItem } from '../../common/readiness.js';

export interface CountryReadinessView {
  countryId: string;
  name: string;
  ready: boolean;
  items: ReadinessItem[];
}

export interface CountryDashboard {
  country: CountryReadinessView;
  /** Every market of the country, with its checklist summary. */
  markets: { marketId: string; name: string; status: MarketStatus; ready: boolean; missingCount: number }[];
}

export interface MarketReadinessView {
  marketId: string;
  name: string;
  status: MarketStatus;
  ready: boolean;
  missingCount: number;
  items: ReadinessItem[];
  country: CountryReadinessView | null;
}

export type GetReadinessResult =
  | { outcome: 'country'; dashboard: CountryDashboard }
  | { outcome: 'market'; readiness: MarketReadinessView }
  | { outcome: 'country_not_found' }
  | { outcome: 'market_not_found' };

/** What a country or a market still needs to quote (admin spec 003, US3; spec 031, `GET /admin/readiness`). */
export class GetReadinessQuery extends IQuery<GetReadinessResult> {
  /** Use `ofCountry` or `ofMarket`. */
  constructor(
    readonly countryId: string | null,
    readonly marketId: string | null,
  ) {
    super();
  }

  static ofCountry(countryId: string): GetReadinessQuery {
    return new GetReadinessQuery(countryId, null);
  }

  static ofMarket(marketId: string): GetReadinessQuery {
    return new GetReadinessQuery(null, marketId);
  }
}
