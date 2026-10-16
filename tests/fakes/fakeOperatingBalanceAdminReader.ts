import type { IOperatingBalanceAdminReader, OperatingBalanceAdminFilter, OperatingBalanceAdminRecord } from '../../src/application/features/operatingBalance/common/adminPorts.js';
import type { FakeMarketRepository } from './fakeMarketRepository.js';
import type { FakeGoalkeeperProfileRepository } from './fakeGoalkeeperProfileRepository.js';
import type { FakeOperatingBalanceStore } from './fakeOperatingBalanceStore.js';

/** The admin's operating balance reads over the fakes: country → markets → profiles → operating balances, like the Mongo reader. */
export class FakeOperatingBalanceAdminReader implements IOperatingBalanceAdminReader {
  constructor(
    private readonly deps: { operatingBalances: FakeOperatingBalanceStore; profiles: FakeGoalkeeperProfileRepository; markets: FakeMarketRepository },
  ) {}

  async list(filter: OperatingBalanceAdminFilter & { page: number; pageSize: number }): Promise<{ items: OperatingBalanceAdminRecord[]; totalItems: number }> {
    const profiles = await this.deps.profiles.getAll();
    const cityOf = new Map(profiles.map((profile) => [profile.userId, profile.marketId ?? null]));
    let allowed: Set<string> | null = null;
    if (filter.countryId || filter.marketIds) {
      allowed = new Set();
      for (const profile of profiles) {
        const market = profile.marketId ? await this.deps.markets.getById(profile.marketId) : null;
        const inCountry = !filter.countryId || market?.countryId === filter.countryId;
        const inMarkets = !filter.marketIds || (market !== null && filter.marketIds.includes(market.id));
        if (market && inCountry && inMarkets) allowed.add(profile.userId);
      }
    }
    const direction = filter.sort === 'balance_desc' ? -1 : 1;
    const all = this.deps.operatingBalances
      .operatingBalances()
      .filter((operatingBalance) => !allowed || allowed.has(operatingBalance.goalkeeperId))
      .filter((operatingBalance) => !filter.negative || operatingBalance.balance < 0)
      .sort((a, b) => direction * (a.balance - b.balance) || a.goalkeeperId.localeCompare(b.goalkeeperId))
      .map((operatingBalance) => ({ goalkeeperId: operatingBalance.goalkeeperId, currency: operatingBalance.currency, balance: operatingBalance.balance, lastMovementAt: operatingBalance.updatedAt, marketId: cityOf.get(operatingBalance.goalkeeperId) ?? null }));
    return { items: all.slice((filter.page - 1) * filter.pageSize, filter.page * filter.pageSize), totalItems: all.length };
  }
}
