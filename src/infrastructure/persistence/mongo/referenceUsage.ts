import type { Db, Document } from 'mongodb';
import type { IFutureBookingsProbe, IReferenceUsage, UsageReason } from '../../../application/features/geography/common/ports.js';
import { BOOKINGS_COLLECTION } from './bookingRepository.js';
import { GOALKEEPER_REQUESTS_COLLECTION } from './goalkeeperRequestRepository.js';
import { QUOTES_COLLECTION } from './quoteRepository.js';
import { TOP_UPS_COLLECTION } from './topUpRepository.js';

/** One place to look: a collection and the filter that means "points at it". */
type Check = readonly [collection: string, filter: Document];

/**
 * What points at a piece of reference data, before the admin deletes it or changes a key others
 * store (admin spec 003, research §8–§9). One `findOne` per collection, `_id` only, in order:
 * the first use found is the reason. Deletes are rare, so unindexed fields are acceptable.
 */
export class MongoReferenceUsage implements IReferenceUsage, IFutureBookingsProbe {
  constructor(private readonly db: Db) {}

  async regionUsage(regionId: string): Promise<UsageReason | null> {
    return (await this.any([['cities', { regionId }]])) ? 'region_has_cities' : null;
  }

  async cityUsage(cityId: string): Promise<UsageReason | null> {
    if (await this.any([['zones', { cityId }]])) return 'city_has_zones';
    if (await this.any([['cities', { zoneCityId: cityId }]])) return 'city_is_anchor';
    const inUse = await this.any([
      ['goalkeeperProfiles', { cityId }],
      ['goalkeeperRegistrations', { 'availability.cityId': cityId }],
      [GOALKEEPER_REQUESTS_COLLECTION, { 'match.cityId': cityId }],
      ['rentalRates', { scope: 'city', refId: cityId }],
      ['bookingSettings', { scope: 'city', refId: cityId }],
      ['commissionSettings', { scope: 'city', refId: cityId }],
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
    const [topUps, regionIds] = await Promise.all([
      this.any([[TOP_UPS_COLLECTION, { countryId }]]),
      this.db.collection('regions').distinct('_id', { countryId }).then((ids) => ids.map(String)),
    ]);
    if (topUps) return true;
    if (regionIds.length === 0) return false;
    const cityIds = (await this.db.collection('cities').distinct('_id', { regionId: { $in: regionIds } })).map(String);
    if (cityIds.length === 0) return false;
    return this.any([
      ['goalkeeperProfiles', { cityId: { $in: cityIds } }],
      [GOALKEEPER_REQUESTS_COLLECTION, { 'match.cityId': { $in: cityIds } }],
    ]);
  }

  async hasFutureRequestsInArea(anchorCityId: string, now: Date): Promise<boolean> {
    const zoneIds = (await this.db.collection('zones').distinct('_id', { cityId: anchorCityId })).map(String);
    if (zoneIds.length === 0) return false;
    return this.any([[GOALKEEPER_REQUESTS_COLLECTION, { zoneId: { $in: zoneIds }, active: true, startsAt: { $gt: now } }]]);
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
