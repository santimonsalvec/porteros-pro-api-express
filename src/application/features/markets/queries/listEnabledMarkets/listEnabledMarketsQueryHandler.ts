import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { IMarketRepository } from '../../common/ports.js';
import { ListEnabledMarketsQuery, type AppMarket } from './listEnabledMarketsQuery.js';

export class ListEnabledMarketsQueryHandler implements IQueryHandler<ListEnabledMarketsQuery, { markets: AppMarket[] }> {
  constructor(private readonly markets: Pick<IMarketRepository, 'listEnabled'>) {}

  async handle(): Promise<{ markets: AppMarket[] }> {
    const markets = await this.markets.listEnabled();
    return {
      markets: markets.map((market) => ({
        id: market.id,
        name: market.name,
        countryId: market.countryId,
        timeZone: market.timeZone,
        mapCenter: { ...market.mapCenter },
      })),
    };
  }
}
