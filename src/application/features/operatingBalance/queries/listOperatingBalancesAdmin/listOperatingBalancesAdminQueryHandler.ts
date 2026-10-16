import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { IUserRepository } from '../../../auth/common/ports.js';
import { pageOf } from '../../../geography/common/views.js';
import { personNames } from '../../../goalkeeperRequests/common/adminNames.js';
import type { ICountryLookup } from '../../../goalkeeperRequests/common/ports.js';
import type { IMarketRepository } from '../../../markets/common/ports.js';
import type { IOperatingBalanceAdminReader } from '../../common/adminPorts.js';
import { ListOperatingBalancesAdminQuery, type ListOperatingBalancesAdminResult } from './listOperatingBalancesAdminQuery.js';

export interface ListOperatingBalancesAdminDependencies {
  reader: IOperatingBalanceAdminReader;
  users: Pick<IUserRepository, 'getByIds'>;
  markets: Pick<IMarketRepository, 'getByIds'>;
  countries: ICountryLookup;
}

/** The goalkeepers' operating balances, with where each one plays (market → country). */
export class ListOperatingBalancesAdminQueryHandler implements IQueryHandler<ListOperatingBalancesAdminQuery, ListOperatingBalancesAdminResult> {
  constructor(private readonly deps: ListOperatingBalancesAdminDependencies) {}

  async handle({ criteria }: ListOperatingBalancesAdminQuery): Promise<ListOperatingBalancesAdminResult> {
    const { items, totalItems } = await this.deps.reader.list(criteria);
    const marketIds = [...new Set(items.flatMap((item) => (item.marketId ? [item.marketId] : [])))];
    const [people, markets] = await Promise.all([personNames(this.deps, items.map((item) => item.goalkeeperId)), marketIds.length > 0 ? this.deps.markets.getByIds(marketIds) : []]);
    const countryIds = [...new Set(markets.map((market) => market.countryId))];
    const countries = await Promise.all(countryIds.map((id) => this.deps.countries.getById(id)));

    const marketById = new Map(markets.map((market) => [market.id, market]));
    const countryName = new Map(countries.filter((country) => country !== null).map((country) => [country.id, country.name]));
    const rows = items.map((item) => {
      const market = item.marketId ? marketById.get(item.marketId) : undefined;
      const countryId = market?.countryId ?? null;
      return {
        goalkeeper: people(item.goalkeeperId),
        marketName: market?.name ?? null,
        countryId,
        countryName: countryId ? (countryName.get(countryId) ?? null) : null,
        balance: item.balance,
        currency: item.currency,
        lastMovementAt: item.lastMovementAt.toISOString(),
      };
    });
    return { outcome: 'ok', page: pageOf(rows, criteria.page, criteria.pageSize, totalItems) };
  }
}
