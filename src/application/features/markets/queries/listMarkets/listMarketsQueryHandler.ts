import type { IQueryHandler } from '../../../../common/mediator/types.js';
import { toMarketViews, type MarketView, type MarketViewDependencies } from '../../common/marketViews.js';
import type { IAdminMarketRepository } from '../../common/ports.js';
import { ListMarketsQuery } from './listMarketsQuery.js';

export class ListMarketsQueryHandler implements IQueryHandler<ListMarketsQuery, { items: MarketView[] }> {
  constructor(private readonly deps: MarketViewDependencies & { markets: Pick<IAdminMarketRepository, 'list'> }) {}

  async handle({ filters }: ListMarketsQuery): Promise<{ items: MarketView[] }> {
    const markets = (await this.deps.markets.list()).filter(
      (market) => (!filters.status || market.status === filters.status) && (!filters.countryId || market.countryId === filters.countryId),
    );
    return { items: await toMarketViews(markets, this.deps, true) };
  }
}
