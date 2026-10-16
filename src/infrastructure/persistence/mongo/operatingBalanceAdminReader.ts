import { MARKETS_COLLECTION } from './marketRepository.js';
import type { Collection, Db, Document } from 'mongodb';
import type { IOperatingBalanceAdminReader, OperatingBalanceAdminFilter, OperatingBalanceAdminRecord } from '../../../application/features/operatingBalance/common/adminPorts.js';
import { operatingBalanceAdminFilter, operatingBalanceAdminSort } from './operatingBalanceAdminPipelines.js';
import { OPERATING_BALANCES_COLLECTION } from './operatingBalanceRepository.js';

/**
 * The admin's operating balances (admin spec 007, research §4). A operating balance keeps no country: a country's
 * goalkeepers are found through its regions, their cities and the profiles in them, each by index.
 */
export class OperatingBalanceAdminReader implements IOperatingBalanceAdminReader {
  private readonly operatingBalances: Collection<Document>;
  private readonly profiles: Collection<Document>;
  private readonly markets: Collection<Document>;

  constructor(db: Db) {
    this.operatingBalances = db.collection(OPERATING_BALANCES_COLLECTION);
    this.profiles = db.collection('goalkeeperProfiles');
    this.markets = db.collection(MARKETS_COLLECTION);
  }

  async list(filter: OperatingBalanceAdminFilter & { page: number; pageSize: number }): Promise<{ items: OperatingBalanceAdminRecord[]; totalItems: number }> {
    const goalkeeperIds = filter.countryId || filter.marketIds ? await this.goalkeepersOf(filter.countryId, filter.marketIds) : undefined;
    if (goalkeeperIds?.length === 0) return { items: [], totalItems: 0 };
    const match = operatingBalanceAdminFilter({ goalkeeperIds, negative: filter.negative });
    const [docs, totalItems] = await Promise.all([
      this.operatingBalances
        .find(match)
        .sort(operatingBalanceAdminSort(filter.sort))
        .skip((filter.page - 1) * filter.pageSize)
        .limit(filter.pageSize)
        .toArray(),
      this.operatingBalances.countDocuments(match),
    ]);
    const ids = docs.map((doc) => String(doc._id));
    const profiles = ids.length > 0 ? await this.profiles.find({ userId: { $in: ids } }, { projection: { userId: 1, marketId: 1 } }).toArray() : [];
    const marketOf = new Map(profiles.map((profile) => [profile.userId as string, (profile.marketId as string | null | undefined) ?? null]));
    return {
      items: docs.map((doc) => ({
        goalkeeperId: String(doc._id),
        currency: doc.currency as string,
        balance: doc.balance as number,
        lastMovementAt: new Date(doc.updatedAt as Date),
        marketId: marketOf.get(String(doc._id)) ?? null,
      })),
      totalItems,
    };
  }

  /** The goalkeepers playing now in the country's markets, or in those of `only` (spec 031: today's data). */
  private async goalkeepersOf(countryId: string | undefined, only: readonly string[] | undefined): Promise<string[]> {
    const ofCountry = countryId ? (await this.markets.find({ countryId }, { projection: { _id: 1 } }).toArray()).map((doc) => String(doc._id)) : undefined;
    const marketIds = ofCountry && only ? ofCountry.filter((id) => only.includes(id)) : (ofCountry ?? [...(only ?? [])]);
    if (marketIds.length === 0) return [];
    const profiles = await this.profiles.find({ marketId: { $in: marketIds } }, { projection: { userId: 1 } }).toArray();
    return profiles.map((profile) => profile.userId as string);
  }
}
