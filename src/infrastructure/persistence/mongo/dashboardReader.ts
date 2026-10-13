import type { Collection, Db, Document } from 'mongodb';
import type {
  CasesArea,
  DashboardReadContext,
  GoalkeepersArea,
  IDashboardReader,
  InvoicingArea,
  RegistrationsArea,
  RequestsArea,
  TopUpsArea,
  WalletsArea,
} from '../../../application/features/dashboard/common/ports.js';
import { CASES_COLLECTION } from './caseRepository.js';
import { goalkeepersSummaryPipeline, matchesPipeline, toGoalkeepersArea, toRequestsArea, toWalletsArea, walletsByCurrencyPipeline, type MatchesFacet } from './dashboardPipelines.js';
import { GOALKEEPER_REQUESTS_COLLECTION } from './goalkeeperRequestRepository.js';
import { documentAdminFilter } from './invoicingDocumentAdminPipelines.js';
import { INVOICING_DOCUMENTS_COLLECTION } from './invoicingDocumentRepository.js';
import { TOP_UPS_COLLECTION } from './topUpRepository.js';
import { WALLETS_COLLECTION } from './walletRepository.js';

/** `{ field: { $in: cityIds } }`, or nothing for the whole platform. */
const inCities = (field: string, cityIds: readonly string[] | null): Document => (cityIds === null ? {} : { [field]: { $in: [...cityIds] } });

/** The dashboard's reads (admin spec 008, research §3–§5), one per area. A country without cities counts nothing. */
export class MongoDashboardReader implements IDashboardReader {
  private readonly requestsCollection: Collection<Document>;
  private readonly profiles: Collection<Document>;
  private readonly registrationsCollection: Collection<Document>;
  private readonly casesCollection: Collection<Document>;
  private readonly documents: Collection<Document>;
  private readonly topUpsCollection: Collection<Document>;
  private readonly walletsCollection: Collection<Document>;

  constructor(db: Db) {
    this.documents = db.collection(INVOICING_DOCUMENTS_COLLECTION);
    this.topUpsCollection = db.collection(TOP_UPS_COLLECTION);
    this.walletsCollection = db.collection(WALLETS_COLLECTION);
    this.requestsCollection = db.collection(GOALKEEPER_REQUESTS_COLLECTION);
    this.profiles = db.collection('goalkeeperProfiles');
    this.registrationsCollection = db.collection('goalkeeperRegistrations');
    this.casesCollection = db.collection(CASES_COLLECTION);
  }

  async goalkeeperIdsInCities(cityIds: readonly string[]): Promise<string[]> {
    if (cityIds.length === 0) return [];
    return (await this.profiles.distinct('userId', { cityId: { $in: [...cityIds] } })).map(String);
  }

  async requests({ scope, windows }: DashboardReadContext): Promise<RequestsArea> {
    const [facet] = await this.requestsCollection.aggregate<MatchesFacet>(matchesPipeline(windows, scope.cityIds, scope.timeZone)).toArray();
    return toRequestsArea(facet, windows.days);
  }

  async goalkeepers({ scope, now }: DashboardReadContext): Promise<GoalkeepersArea> {
    const [group] = await this.profiles.aggregate<GoalkeepersArea>(goalkeepersSummaryPipeline(scope.cityIds, now)).toArray();
    return toGoalkeepersArea(group);
  }

  /** Without a scope every one counts, also those that have not picked a city yet. */
  async registrations({ scope }: DashboardReadContext): Promise<RegistrationsArea> {
    if (scope.cityIds?.length === 0) return { inProgress: 0 };
    return { inProgress: await this.registrationsCollection.countDocuments({ status: 'in_progress', ...inCities('availability.cityId', scope.cityIds) }) };
  }

  /** Cases don't store their place: the scope goes through their requests, as the case list does (spec 006). */
  async cases({ scope }: DashboardReadContext): Promise<CasesArea> {
    if (scope.cityIds === null) return { open: await this.casesCollection.countDocuments({ status: 'open' }) };
    if (scope.cityIds.length === 0) return { open: 0 };
    const requestIds = await this.casesCollection.distinct('requestId', { status: 'open' });
    if (requestIds.length === 0) return { open: 0 };
    const inScope = await this.requestsCollection.distinct('_id', { _id: { $in: requestIds }, ...inCities('match.cityId', scope.cityIds) });
    if (inScope.length === 0) return { open: 0 };
    return { open: await this.casesCollection.countDocuments({ status: 'open', requestId: { $in: inScope } }) };
  }

  /** The same rule as the document list's "atascados" (spec 007), imported, not copied. */
  async invoicing(context: DashboardReadContext): Promise<InvoicingArea> {
    const scope = await this.moneyScope(context);
    if (scope === null) return { rejected: 0, stale: 0 };
    const [rejected, stale] = await Promise.all([
      this.documents.countDocuments({ ...documentAdminFilter({ status: 'rejected', countryId: scope.countryId }, context.now), ...scope.goalkeepers }),
      this.documents.countDocuments({ ...documentAdminFilter({ stale: true, countryId: scope.countryId }, context.now), ...scope.goalkeepers }),
    ]);
    return { rejected, stale };
  }

  async topUps(context: DashboardReadContext): Promise<TopUpsArea> {
    const scope = await this.moneyScope(context);
    if (scope === null) return { pending: 0 };
    return { pending: await this.topUpsCollection.countDocuments({ status: 'pending', ...(scope.countryId ? { countryId: scope.countryId } : {}), ...scope.goalkeepers }) };
  }

  async wallets(context: DashboardReadContext): Promise<WalletsArea> {
    const goalkeeperIds = await context.goalkeeperIds();
    if (goalkeeperIds?.length === 0) return { byCurrency: [] };
    return toWalletsArea(await this.walletsCollection.aggregate<{ _id: string; balanceTotal: number; debtTotal: number; negativeCount: number }>(walletsByCurrencyPipeline(goalkeeperIds)).toArray());
  }

  /**
   * Documents and top-ups store their country: a country is filtered by it, a city through its
   * goalkeepers (`null` when that city has none, so nothing is read).
   */
  private async moneyScope({ scope, goalkeeperIds }: DashboardReadContext): Promise<{ countryId?: string; goalkeepers: Document } | null> {
    if (scope.cityId === null) return { countryId: scope.countryId ?? undefined, goalkeepers: {} };
    const ids = (await goalkeeperIds()) ?? [];
    return ids.length === 0 ? null : { goalkeepers: { goalkeeperId: { $in: ids } } };
  }
}
