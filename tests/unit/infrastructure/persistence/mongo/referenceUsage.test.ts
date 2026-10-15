import { describe, expect, it } from 'vitest';
import type { Db, Document } from 'mongodb';
import { MongoReferenceUsage } from '../../../../../src/infrastructure/persistence/mongo/referenceUsage.js';
import { createFakeCollection, toArrayResult, type FakeMongoCollection } from '../../../../fakes/fakeMongoCollection.js';

/** A database whose collections answer `findOne` only for the filters marked as used. */
function databaseWith(used: Record<string, Document[]> = {}, distinct: Record<string, unknown[]> = {}) {
  const collections = new Map<string, FakeMongoCollection>();
  const db = {
    collection: (name: string) => {
      let collection = collections.get(name);
      if (!collection) {
        collection = createFakeCollection();
        const matches = used[name] ?? [];
        collection.findOne.mockImplementation(async (filter: Document) =>
          matches.some((m) => JSON.stringify(m) === JSON.stringify(filter)) ? { _id: 'x' } : null,
        );
        collection.distinct.mockResolvedValue(distinct[name] ?? []);
        collection.find.mockImplementation(() => toArrayResult([]));
        collections.set(name, collection);
      }
      return collection;
    },
  } as unknown as Db;
  return { usage: new MongoReferenceUsage(db), collections };
}

const ID_ONLY = { projection: { _id: 1 } };

describe('MongoReferenceUsage', () => {
  describe('cityUsage', () => {
    it.each([
      ['zones', { cityId: 'med' }, 'city_has_zones'],
      ['cities', { zoneCityId: 'med' }, 'city_is_anchor'],
      ['goalkeeperProfiles', { cityId: 'med' }, 'city_in_use'],
      ['goalkeeperRegistrations', { 'availability.cityId': 'med' }, 'city_in_use'],
      ['goalkeeperRequests', { 'match.cityId': 'med' }, 'city_in_use'],
      ['rentalRates', { scope: 'city', refId: 'med' }, 'city_in_use'],
      ['bookingSettings', { scope: 'city', refId: 'med' }, 'city_in_use'],
      ['commissionSettings', { scope: 'city', refId: 'med' }, 'city_in_use'],
    ])('finds a use in %s', async (collection, filter, reason) => {
      const { usage } = databaseWith({ [collection]: [filter] });
      expect(await usage.cityUsage('med')).toBe(reason);
    });

    it('reports zones before anything else, and nothing when unused', async () => {
      const both = databaseWith({ zones: [{ cityId: 'med' }], goalkeeperProfiles: [{ cityId: 'med' }] });
      expect(await both.usage.cityUsage('med')).toBe('city_has_zones');
      const { usage, collections } = databaseWith();
      expect(await usage.cityUsage('med')).toBeNull();
      expect(collections.get('zones')!.findOne).toHaveBeenCalledWith({ cityId: 'med' }, ID_ONLY);
    });
  });

  describe('zoneUsage', () => {
    it.each([
      ['goalkeeperProfiles', { zoneIds: 'z1' }],
      ['goalkeeperRegistrations', { 'availability.zoneIds': 'z1' }],
      ['goalkeeperRequests', { zoneId: 'z1' }],
      ['bookings', { zoneId: 'z1' }],
      ['rentalRates', { scope: 'zone', refId: 'z1' }],
      ['commissionSettings', { scope: 'zone', refId: 'z1' }],
    ])('finds a use in %s', async (collection, filter) => {
      const { usage } = databaseWith({ [collection]: [filter] });
      expect(await usage.zoneUsage('z1')).toBe('zone_in_use');
    });

    it('is null when unused', async () => {
      expect(await databaseWith().usage.zoneUsage('z1')).toBeNull();
    });

    it('tells which of several zones something points at', async () => {
      const { usage } = databaseWith({}, { goalkeeperProfiles: ['z1'], bookings: ['z2'] });
      expect(await usage.zonesInUse(['z1', 'z2', 'z3'])).toEqual(new Set(['z1', 'z2']));
    });
  });

  describe('regionUsage and countryOperates', () => {
    it('a region with cities', async () => {
      expect(await databaseWith({ cities: [{ regionId: 'ant' }] }).usage.regionUsage('ant')).toBe('region_has_cities');
      expect(await databaseWith().usage.regionUsage('ant')).toBeNull();
    });

    it('a country operates with deposits, or goalkeepers or requests in its cities', async () => {
      const cities = { regions: ['ant'], cities: ['med'] };
      expect(await databaseWith({ deposits: [{ countryId: 'co' }] }).usage.countryOperates('co')).toBe(true);
      expect(await databaseWith({ goalkeeperProfiles: [{ cityId: { $in: ['med'] } }] }, { regions: ['ant'], cities: ['med'] }).usage.countryOperates('co')).toBe(
        true,
      );
      expect(await databaseWith({ goalkeeperRequests: [{ 'match.cityId': { $in: ['med'] } }] }, cities).usage.countryOperates('co')).toBe(true);
      expect(await databaseWith({}, cities).usage.countryOperates('co')).toBe(false);
    });
  });

  describe('catalogs', () => {
    it('a document type is used by its code, in profiles or registrations', async () => {
      expect(await databaseWith({ goalkeeperProfiles: [{ documentType: 'cc' }] }).usage.documentTypeUsage('cc')).toBe('document_type_in_use');
      expect(
        await databaseWith({ goalkeeperRegistrations: [{ 'identification.documentType': 'cc' }] }).usage.documentTypeUsage('cc'),
      ).toBe('document_type_in_use');
      expect(await databaseWith().usage.documentTypeUsage('cc')).toBeNull();
    });

    it('a surface is used by requests or quotes', async () => {
      expect(await databaseWith({ goalkeeperRequests: [{ 'match.format.surfaceId': 's' }] }).usage.surfaceUsage('s')).toBe('surface_in_use');
      expect(await databaseWith({ quotes: [{ 'match.format.surfaceId': 's' }] }).usage.surfaceUsage('s')).toBe('surface_in_use');
      expect(await databaseWith().usage.surfaceUsage('s')).toBeNull();
    });

    it('tells which codes and surfaces are in use', async () => {
      const { usage } = databaseWith({}, { goalkeeperProfiles: ['cc'], goalkeeperRegistrations: ['ce'], goalkeeperRequests: ['s1'], quotes: ['s2'] });
      expect(await usage.documentTypesInUse(['cc', 'ce', 'pa'])).toEqual(new Set(['cc', 'ce']));
      expect(await usage.surfacesInUse(['s1', 's2', 's3'])).toEqual(new Set(['s1', 's2']));
    });
  });

  describe('hasFutureRequestsInArea', () => {
    it("looks for an active request after now in the anchor's zones", async () => {
      const now = new Date('2026-10-08T12:00:00Z');
      const { usage, collections } = databaseWith(
        { goalkeeperRequests: [{ zoneId: { $in: ['z1'] }, active: true, startsAt: { $gt: now.toISOString() } }] },
        { zones: ['z1'] },
      );
      const requests = () => collections.get('goalkeeperRequests')!;

      await usage.hasFutureRequestsInArea('med', now);

      expect(collections.get('zones')!.distinct).toHaveBeenCalledWith('_id', { cityId: 'med' });
      expect(requests().findOne).toHaveBeenCalledWith({ zoneId: { $in: ['z1'] }, active: true, startsAt: { $gt: now } }, ID_ONLY);
    });

    it('is false when the anchor has no zones', async () => {
      expect(await databaseWith().usage.hasFutureRequestsInArea('med', new Date())).toBe(false);
    });
  });
});
