import type { IOperatingBalanceAdminReader, OperatingBalanceAdminFilter, OperatingBalanceAdminRecord } from '../../src/application/features/operatingBalance/common/adminPorts.js';
import type { FakeCityRepository } from './fakeCityRepository.js';
import type { FakeGoalkeeperProfileRepository } from './fakeGoalkeeperProfileRepository.js';
import type { FakeRegionRepository } from './fakeRegionRepository.js';
import type { FakeOperatingBalanceStore } from './fakeOperatingBalanceStore.js';

/** The admin's operating balance reads over the fakes: country → regions → cities → profiles → operating balances, like the Mongo reader. */
export class FakeOperatingBalanceAdminReader implements IOperatingBalanceAdminReader {
  constructor(
    private readonly deps: { operatingBalances: FakeOperatingBalanceStore; profiles: FakeGoalkeeperProfileRepository; cities: FakeCityRepository; regions: FakeRegionRepository },
  ) {}

  async list(filter: OperatingBalanceAdminFilter & { page: number; pageSize: number }): Promise<{ items: OperatingBalanceAdminRecord[]; totalItems: number }> {
    const profiles = await this.deps.profiles.getAll();
    const cityOf = new Map(profiles.map((profile) => [profile.userId, profile.cityId ?? null]));
    let allowed: Set<string> | null = null;
    if (filter.countryId) {
      allowed = new Set();
      for (const profile of profiles) {
        const city = profile.cityId ? await this.deps.cities.getById(profile.cityId) : null;
        const [region] = city ? await this.deps.regions.getByIds([city.regionId]) : [];
        if (region?.countryId === filter.countryId) allowed.add(profile.userId);
      }
    }
    const direction = filter.sort === 'balance_desc' ? -1 : 1;
    const all = this.deps.operatingBalances
      .operatingBalances()
      .filter((operatingBalance) => !allowed || allowed.has(operatingBalance.goalkeeperId))
      .filter((operatingBalance) => !filter.negative || operatingBalance.balance < 0)
      .sort((a, b) => direction * (a.balance - b.balance) || a.goalkeeperId.localeCompare(b.goalkeeperId))
      .map((operatingBalance) => ({ goalkeeperId: operatingBalance.goalkeeperId, currency: operatingBalance.currency, balance: operatingBalance.balance, lastMovementAt: operatingBalance.updatedAt, cityId: cityOf.get(operatingBalance.goalkeeperId) ?? null }));
    return { items: all.slice((filter.page - 1) * filter.pageSize, filter.page * filter.pageSize), totalItems: all.length };
  }
}
