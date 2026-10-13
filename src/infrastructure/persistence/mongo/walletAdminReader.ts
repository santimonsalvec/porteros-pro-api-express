import type { Collection, Db, Document } from 'mongodb';
import type { IWalletAdminReader, WalletAdminFilter, WalletAdminRecord } from '../../../application/features/wallet/common/adminPorts.js';
import { walletAdminFilter, walletAdminSort } from './walletAdminPipelines.js';
import { WALLETS_COLLECTION } from './walletRepository.js';

/**
 * The admin's wallets (admin spec 007, research §4). A wallet keeps no country: a country's
 * goalkeepers are found through its regions, their cities and the profiles in them, each by index.
 */
export class WalletAdminReader implements IWalletAdminReader {
  private readonly wallets: Collection<Document>;
  private readonly profiles: Collection<Document>;
  private readonly cities: Collection<Document>;
  private readonly regions: Collection<Document>;

  constructor(db: Db) {
    this.wallets = db.collection(WALLETS_COLLECTION);
    this.profiles = db.collection('goalkeeperProfiles');
    this.cities = db.collection('cities');
    this.regions = db.collection('regions');
  }

  async list(filter: WalletAdminFilter & { page: number; pageSize: number }): Promise<{ items: WalletAdminRecord[]; totalItems: number }> {
    const goalkeeperIds = filter.countryId ? await this.goalkeepersOf(filter.countryId) : undefined;
    if (goalkeeperIds?.length === 0) return { items: [], totalItems: 0 };
    const match = walletAdminFilter({ goalkeeperIds, negative: filter.negative });
    const [docs, totalItems] = await Promise.all([
      this.wallets
        .find(match)
        .sort(walletAdminSort(filter.sort))
        .skip((filter.page - 1) * filter.pageSize)
        .limit(filter.pageSize)
        .toArray(),
      this.wallets.countDocuments(match),
    ]);
    const ids = docs.map((doc) => String(doc._id));
    const profiles = ids.length > 0 ? await this.profiles.find({ userId: { $in: ids } }, { projection: { userId: 1, cityId: 1 } }).toArray() : [];
    const cityOf = new Map(profiles.map((profile) => [profile.userId as string, (profile.cityId as string | null | undefined) ?? null]));
    return {
      items: docs.map((doc) => ({
        goalkeeperId: String(doc._id),
        currency: doc.currency as string,
        balance: doc.balance as number,
        lastMovementAt: new Date(doc.updatedAt as Date),
        cityId: cityOf.get(String(doc._id)) ?? null,
      })),
      totalItems,
    };
  }

  private async goalkeepersOf(countryId: string): Promise<string[]> {
    const regionIds = (await this.regions.find({ countryId }, { projection: { _id: 1 } }).toArray()).map((doc) => doc._id);
    if (regionIds.length === 0) return [];
    const cityIds = (await this.cities.find({ regionId: { $in: regionIds.map(String) } }, { projection: { _id: 1 } }).toArray()).map((doc) => String(doc._id));
    if (cityIds.length === 0) return [];
    const profiles = await this.profiles.find({ cityId: { $in: cityIds } }, { projection: { userId: 1 } }).toArray();
    return profiles.map((profile) => profile.userId as string);
  }
}
