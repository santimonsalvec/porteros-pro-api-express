import { IQuery } from '../../../../common/mediator/types.js';
import type { MarketStatus } from '../../../../../domain/markets/market.js';
import type { MarketView } from '../../common/marketViews.js';

export interface MarketFilters {
  status?: MarketStatus;
  countryId?: string;
}

/** Every market, by name (spec 031, contract §C): a few dozen at most, so not paged. */
export class ListMarketsQuery extends IQuery<{ items: MarketView[] }> {
  constructor(readonly filters: MarketFilters) {
    super();
  }
}
