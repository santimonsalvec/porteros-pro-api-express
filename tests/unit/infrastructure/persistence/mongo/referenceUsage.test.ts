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
  describe('cityUsage (a billing municipality, spec 031)', () => {
    it.each([
      ['goalkeeperProfiles', { 'billing.cityId': 'med' }],
      ['goalkeeperRegistrations', { 'billing.cityId': 'med' }],
      ['invoicingDocuments', { 'buyer.cityId': 'med' }],
    ])('finds a use in %s', async (collection, filter) => {
      const { usage } = databaseWith({ [collection]: [filter] });
      expect(await usage.cityUsage('med')).toBe('city_in_use');
    });

    it('is null when no goalkeeper lives there', async () => {
      const { usage, collections } = databaseWith({ zones: [{ marketId: 'med' }] });
      expect(await usage.cityUsage('med')).toBeNull();
      expect(collections.get('goalkeeperProfiles')!.findOne).toHaveBeenCalledWith({ 'billing.cityId': 'med' }, ID_ONLY);
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

    it('a country operates with deposits, or goalkeepers or requests in its markets', async () => {
      const markets = { markets: ['med'] };
      expect(await databaseWith({ deposits: [{ countryId: 'co' }] }).usage.countryOperates('co')).toBe(true);
      expect(await databaseWith({ goalkeeperProfiles: [{ marketId: { $in: ['med'] } }] }, markets).usage.countryOperates('co')).toBe(true);
      expect(await databaseWith({ goalkeeperRequests: [{ 'match.marketId': { $in: ['med'] } }] }, markets).usage.countryOperates('co')).toBe(true);
      expect(await databaseWith({}, markets).usage.countryOperates('co')).toBe(false);
      expect(await databaseWith({}).usage.countryOperates('co')).toBe(false);
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

      expect(collections.get('zones')!.distinct).toHaveBeenCalledWith('_id', { marketId: 'med' });
      expect(requests().findOne).toHaveBeenCalledWith({ zoneId: { $in: ['z1'] }, active: true, startsAt: { $gt: now } }, ID_ONLY);
    });

    it('is false when the anchor has no zones', async () => {
      expect(await databaseWith().usage.hasFutureRequestsInArea('med', new Date())).toBe(false);
    });
  });

  describe('marketUsage (spec 031, data-model §12)', () => {
    /** A database whose `countDocuments` answers per collection and filter. */
    function countingDatabase(counts: Record<string, [Document, number][]>, zoneIds: string[] = []) {
      const collections = new Map<string, FakeMongoCollection>();
      const db = {
        collection: (name: string) => {
          let collection = collections.get(name);
          if (!collection) {
            collection = createFakeCollection();
            collection.countDocuments.mockImplementation(async (filter: Document) =>
              (counts[name] ?? []).find(([match]) => JSON.stringify(match) === JSON.stringify(filter))?.[1] ?? 0,
            );
            collection.distinct.mockResolvedValue(name === 'zones' ? zoneIds : []);
            collections.set(name, collection);
          }
          return collection;
        },
      } as unknown as Db;
      return new MongoReferenceUsage(db);
    }

    it('is null for a market nothing points at', async () => {
      expect(await countingDatabase({}).marketUsage('bog')).toBeNull();
    });

    it.each([
      ['zones', { zones: [[{ marketId: 'bog' }, 2]] }, { kind: 'zones', count: 2 }],
      [
        'settings',
        { rentalRates: [[{ scope: 'market', refId: 'bog' }, 3]], paymentGatewaySettings: [[{ scope: 'market', refId: 'bog' }, 1]] },
        { kind: 'settings', count: 4 },
      ],
      [
        'goalkeepers',
        { goalkeeperProfiles: [[{ marketId: 'bog' }, 1]], goalkeeperRegistrations: [[{ 'availability.marketId': 'bog' }, 2]] },
        { kind: 'goalkeepers', count: 3 },
      ],
      ['bookings', { quotes: [[{ 'match.marketId': 'bog' }, 1]], goalkeeperRequests: [[{ 'match.marketId': 'bog' }, 1]] }, { kind: 'bookings', count: 2 }],
      ['records', { balanceMovements: [[{ marketId: 'bog' }, 5]], invoicingDocuments: [[{ marketId: 'bog' }, 1]] }, { kind: 'records', count: 6 }],
      ['staffScopes', { staffMembers: [[{ scopes: { $elemMatch: { kind: 'market', id: 'bog' } } }, 1]] }, { kind: 'staffScopes', count: 1 }],
    ] as const)('counts %s', async (_kind, counts, expected) => {
      expect(await countingDatabase(counts as unknown as Record<string, [Document, number][]>).marketUsage('bog')).toEqual(expected);
    });

    it('answers the first kind in order, and counts bookings by the market zones', async () => {
      const usage = countingDatabase(
        { zones: [[{ marketId: 'bog' }, 1]], staffMembers: [[{ scopes: { $elemMatch: { kind: 'market', id: 'bog' } } }, 4]] },
        ['z-1'],
      );
      expect(await usage.marketUsage('bog')).toEqual({ kind: 'zones', count: 1 });

      const bookings = countingDatabase({ bookings: [[{ zoneId: { $in: ['z-1'] } }, 2]] }, ['z-1']);
      expect(await bookings.marketUsage('bog')).toEqual({ kind: 'bookings', count: 2 });
    });
  });
});
