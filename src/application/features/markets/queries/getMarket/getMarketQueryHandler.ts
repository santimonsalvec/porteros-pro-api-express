import type { IQueryHandler } from '../../../../common/mediator/types.js';
import { toMarketViews, type MarketViewDependencies } from '../../common/marketViews.js';
import type { IAdminMarketRepository } from '../../common/ports.js';
import { GetMarketQuery, type GetMarketResult } from './getMarketQuery.js';

export class GetMarketQueryHandler implements IQueryHandler<GetMarketQuery, GetMarketResult> {
  constructor(private readonly deps: MarketViewDependencies & { markets: Pick<IAdminMarketRepository, 'getById'> }) {}

  async handle({ marketId }: GetMarketQuery): Promise<GetMarketResult> {
    const market = await this.deps.markets.getById(marketId);
    if (!market) return { outcome: 'not_found' };
    const [view] = await toMarketViews([market], this.deps, false);
    return { outcome: 'ok', market: view! };
  }
}
