import { IQuery } from '../../../../common/mediator/types.js';
import type { MarketView } from '../../common/marketViews.js';

export type GetMarketResult = { outcome: 'ok'; market: MarketView } | { outcome: 'not_found' };

export class GetMarketQuery extends IQuery<GetMarketResult> {
  constructor(readonly marketId: string) {
    super();
  }
}
