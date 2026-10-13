import type { IWalletAdminReader, WalletAdminFilter, WalletAdminRecord } from '../../src/application/features/wallet/common/adminPorts.js';
import type { FakeCityRepository } from './fakeCityRepository.js';
import type { FakeGoalkeeperProfileRepository } from './fakeGoalkeeperProfileRepository.js';
import type { FakeRegionRepository } from './fakeRegionRepository.js';
import type { FakeWalletStore } from './fakeWalletStore.js';

/** The admin's wallet reads over the fakes: country → regions → cities → profiles → wallets, like the Mongo reader. */
export class FakeWalletAdminReader implements IWalletAdminReader {
  constructor(
    private readonly deps: { wallets: FakeWalletStore; profiles: FakeGoalkeeperProfileRepository; cities: FakeCityRepository; regions: FakeRegionRepository },
  ) {}

  async list(filter: WalletAdminFilter & { page: number; pageSize: number }): Promise<{ items: WalletAdminRecord[]; totalItems: number }> {
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
    const all = this.deps.wallets
      .wallets()
      .filter((wallet) => !allowed || allowed.has(wallet.goalkeeperId))
      .filter((wallet) => !filter.negative || wallet.balance < 0)
      .sort((a, b) => direction * (a.balance - b.balance) || a.goalkeeperId.localeCompare(b.goalkeeperId))
      .map((wallet) => ({ goalkeeperId: wallet.goalkeeperId, currency: wallet.currency, balance: wallet.balance, lastMovementAt: wallet.updatedAt, cityId: cityOf.get(wallet.goalkeeperId) ?? null }));
    return { items: all.slice((filter.page - 1) * filter.pageSize, filter.page * filter.pageSize), totalItems: all.length };
  }
}
