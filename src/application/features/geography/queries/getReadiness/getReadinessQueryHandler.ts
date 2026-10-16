import type { Country } from '../../../../../domain/countries/country.js';
import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { IAdminMarketRepository } from '../../../markets/common/ports.js';
import { countryReadiness, marketReadiness, readinessForMarkets, type ReadinessDependencies } from '../../common/readiness.js';
import { GetReadinessQuery, type CountryReadinessView, type GetReadinessResult, type MarketReadinessView } from './getReadinessQuery.js';

export type GetReadinessDependencies = ReadinessDependencies & { markets: Pick<IAdminMarketRepository, 'getById' | 'listByCountry'> };

export class GetReadinessQueryHandler implements IQueryHandler<GetReadinessQuery, GetReadinessResult> {
  constructor(private readonly deps: GetReadinessDependencies) {}

  async handle(query: GetReadinessQuery): Promise<GetReadinessResult> {
    return query.marketId !== null ? this.market(query.marketId) : this.country(query.countryId ?? '');
  }

  private async country(countryId: string): Promise<GetReadinessResult> {
    const country = await this.deps.countries.getById(countryId);
    if (!country) return { outcome: 'country_not_found' };
    const markets = await this.deps.markets.listByCountry(country.id);
    // The checklists of every market in one batch, beside the country's own.
    const [results, countryView] = await Promise.all([readinessForMarkets(this.deps, markets), this.countryView(country)]);
    const rows = markets.map((market) => {
      const { ready, missingCount } = results.get(market.id)!;
      return { marketId: market.id, name: market.name, status: market.status, ready, missingCount };
    });
    return { outcome: 'country', dashboard: { country: countryView, markets: rows } };
  }

  private async market(marketId: string): Promise<GetReadinessResult> {
    const market = await this.deps.markets.getById(marketId);
    if (!market) return { outcome: 'market_not_found' };
    const country = await this.deps.countries.getById(market.countryId);
    const [{ items, ready, missingCount }, countryResult] = await Promise.all([
      marketReadiness(this.deps, market),
      country ? this.countryView(country) : Promise.resolve(null),
    ]);
    const readiness: MarketReadinessView = { marketId: market.id, name: market.name, status: market.status, country: countryResult, items, ready, missingCount };
    return { outcome: 'market', readiness };
  }

  private async countryView(country: Country): Promise<CountryReadinessView> {
    const { items, ready } = await countryReadiness(this.deps, country);
    return { countryId: country.id, name: country.name, ready, items };
  }
}
