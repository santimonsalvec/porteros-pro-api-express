import type { Db, Document } from 'mongodb';
import type { IFutureBookingsProbe, IReferenceUsage, UsageReason } from '../../../application/features/geography/common/ports.js';
import type { IMarketUsage, MarketUsage, MarketUsageKind } from '../../../application/features/markets/common/marketUsage.js';
import { BOOKINGS_COLLECTION } from './bookingRepository.js';
import { GOALKEEPER_REQUESTS_COLLECTION } from './goalkeeperRequestRepository.js';
import { QUOTES_COLLECTION } from './quoteRepository.js';
import { DEPOSITS_COLLECTION } from './depositRepository.js';
import { INVOICING_DOCUMENTS_COLLECTION } from './invoicingDocumentRepository.js';
import { MARKETS_COLLECTION } from './marketRepository.js';

/** One place to look: a collection and the filter that means "points at it". */
type Check = readonly [collection: string, filter: Document];

/**
 * What points at a piece of reference data, before the admin deletes it or changes a key others
 * store (admin spec 003, research §8–§9). One `findOne` per collection, `_id` only, in order:
 * the first use found is the reason. Deletes are rare, so unindexed fields are acceptable.
 */
export class MongoReferenceUsage implements IReferenceUsage, IFutureBookingsProbe, IMarketUsage {
  constructor(private readonly db: Db) {}

  async regionUsage(regionId: string): Promise<UsageReason | null> {
    return (await this.any([['cities', { regionId }]])) ? 'region_has_cities' : null;
  }

  /** A municipality is only billing data (spec 031): it is in use when a goalkeeper lives there. */
  async cityUsage(cityId: string): Promise<UsageReason | null> {
    const inUse = await this.any([
      ['goalkeeperProfiles', { 'billing.cityId': cityId }],
      ['goalkeeperRegistrations', { 'billing.cityId': cityId }],
      [INVOICING_DOCUMENTS_COLLECTION, { 'buyer.cityId': cityId }],
    ]);
    return inUse ? 'city_in_use' : null;
  }

  async zoneUsage(zoneId: string): Promise<UsageReason | null> {
    const inUse = await this.any([
      ['goalkeeperProfiles', { zoneIds: zoneId }],
      ['goalkeeperRegistrations', { 'availability.zoneIds': zoneId }],
      [GOALKEEPER_REQUESTS_COLLECTION, { zoneId }],
      [BOOKINGS_COLLECTION, { zoneId }],
      ['rentalRates', { scope: 'zone', refId: zoneId }],
      ['commissionSettings', { scope: 'zone', refId: zoneId }],
    ]);
    return inUse ? 'zone_in_use' : null;
  }

  async documentTypeUsage(code: string): Promise<UsageReason | null> {
    const inUse = await this.any([
      ['goalkeeperProfiles', { documentType: code }],
      ['goalkeeperRegistrations', { 'identification.documentType': code }],
    ]);
    return inUse ? 'document_type_in_use' : null;
  }

  async surfaceUsage(surfaceId: string): Promise<UsageReason | null> {
    const inUse = await this.any([
      [GOALKEEPER_REQUESTS_COLLECTION, { 'match.format.surfaceId': surfaceId }],
      [QUOTES_COLLECTION, { 'match.format.surfaceId': surfaceId }],
    ]);
    return inUse ? 'surface_in_use' : null;
  }

  zonesInUse(zoneIds: string[]): Promise<Set<string>> {
    return this.used(zoneIds, [
      ['goalkeeperProfiles', 'zoneIds'],
      ['goalkeeperRegistrations', 'availability.zoneIds'],
      [GOALKEEPER_REQUESTS_COLLECTION, 'zoneId'],
      [BOOKINGS_COLLECTION, 'zoneId'],
    ]);
  }

  documentTypesInUse(codes: string[]): Promise<Set<string>> {
    return this.used(codes, [
      ['goalkeeperProfiles', 'documentType'],
      ['goalkeeperRegistrations', 'identification.documentType'],
    ]);
  }

  surfacesInUse(surfaceIds: string[]): Promise<Set<string>> {
    return this.used(surfaceIds, [
      [GOALKEEPER_REQUESTS_COLLECTION, 'match.format.surfaceId'],
      [QUOTES_COLLECTION, 'match.format.surfaceId'],
    ]);
  }

  async countryOperates(countryId: string): Promise<boolean> {
    const [deposits, marketIds] = await Promise.all([
      this.any([[DEPOSITS_COLLECTION, { countryId }]]),
      this.db.collection(MARKETS_COLLECTION).distinct('_id', { countryId }).then((ids) => ids.map(String)),
    ]);
    if (deposits) return true;
    if (marketIds.length === 0) return false;
    return this.any([
      ['goalkeeperProfiles', { marketId: { $in: marketIds } }],
      [GOALKEEPER_REQUESTS_COLLECTION, { 'match.marketId': { $in: marketIds } }],
    ]);
  }

  async hasFutureRequestsInArea(marketId: string, now: Date): Promise<boolean> {
    const zoneIds = (await this.db.collection('zones').distinct('_id', { marketId })).map(String);
    if (zoneIds.length === 0) return false;
    return this.any([[GOALKEEPER_REQUESTS_COLLECTION, { zoneId: { $in: zoneIds }, active: true, startsAt: { $gt: now } }]]);
  }

  /**
   * What points at a market, kind by kind in the order of data-model §12; the first kind with
   * records is the answer. Bookings carry the zone, not the market, so they count by its zones.
   */
  async marketUsage(marketId: string): Promise<MarketUsage | null> {
    const scoped = { scope: 'market', refId: marketId };
    const byMarket = { marketId };
    const zoneIds = (await this.db.collection('zones').distinct('_id', byMarket)).map(String);
    const groups: [MarketUsageKind, Check[]][] = [
      ['zones', [['zones', byMarket]]],
      [
        'settings',
        ['bookingSettings', 'rentalRates', 'commissionSettings', 'unverifiedDiscounts', 'paymentGatewaySettings'].map((name) => [name, scoped] as const),
      ],
      [
        'goalkeepers',
        [
          ['goalkeeperRegistrations', { 'availability.marketId': marketId }],
          ['goalkeeperProfiles', byMarket],
        ],
      ],
      [
        'bookings',
        [
          [QUOTES_COLLECTION, { 'match.marketId': marketId }],
          [GOALKEEPER_REQUESTS_COLLECTION, { 'match.marketId': marketId }],
          ...(zoneIds.length > 0 ? [[BOOKINGS_COLLECTION, { zoneId: { $in: zoneIds } }] as const] : []),
        ],
      ],
      ['records', ['balanceMovements', DEPOSITS_COLLECTION, INVOICING_DOCUMENTS_COLLECTION, 'goalkeeperIncidents'].map((name) => [name, byMarket] as const)],
      ['staffScopes', [['staffMembers', { scopes: { $elemMatch: { kind: 'market', id: marketId } } }]]],
    ];
    for (const [kind, checks] of groups) {
      const counts = await Promise.all(checks.map(([collection, filter]) => this.db.collection(collection).countDocuments(filter)));
      const count = counts.reduce((sum, value) => sum + value, 0);
      if (count > 0) return { kind, count };
    }
    return null;
  }

  /** All the checks at once: against a remote database, waiting for each in turn is the slow part. */
  private async any(checks: readonly Check[]): Promise<boolean> {
    const found = await Promise.all(checks.map(([collection, filter]) => this.db.collection(collection).findOne(filter, { projection: { _id: 1 } })));
    return found.some((doc) => doc !== null);
  }

  /** The `ids` that appear in any of the given collection fields. */
  private async used(ids: string[], fields: readonly (readonly [collection: string, field: string])[]): Promise<Set<string>> {
    const found = new Set<string>();
    if (ids.length === 0) return found;
    const lists = await Promise.all(fields.map(([collection, field]) => this.db.collection(collection).distinct(field, { [field]: { $in: ids } })));
    for (const value of lists.flat()) if (ids.includes(String(value))) found.add(String(value));
    return found;
  }
}
