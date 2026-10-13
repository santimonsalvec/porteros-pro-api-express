import { beforeEach, describe, expect, it } from 'vitest';
import type { Collection, Db, Document } from 'mongodb';
import type { DashboardReadContext } from '../../../../../src/application/features/dashboard/common/ports.js';
import type { DashboardScope } from '../../../../../src/application/features/dashboard/common/scope.js';
import { MongoDashboardReader } from '../../../../../src/infrastructure/persistence/mongo/dashboardReader.js';
import { createFakeCollection, toArrayResult, type FakeMongoCollection } from '../../../../fakes/fakeMongoCollection.js';

const NOW = new Date('2026-10-13T14:00:00.000Z');
const DAYS = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18'];
const windows = {
  today: { from: new Date('2026-10-13T05:00:00.000Z'), to: new Date('2026-10-14T05:00:00.000Z') },
  week: { from: new Date('2026-10-12T05:00:00.000Z'), to: new Date('2026-10-19T05:00:00.000Z') },
  days: DAYS,
};
const PLATFORM: DashboardScope = { countryId: null, cityId: null, cityIds: null, timeZone: 'America/Bogota', timeZoneSource: 'platform', timeZoneFallback: null };
const MEDELLIN: DashboardScope = { ...PLATFORM, countryId: 'co', cityId: 'medellin', cityIds: ['medellin'], timeZoneSource: 'city' };

function contextFor(scope: DashboardScope, goalkeeperIds: string[] | null = null): DashboardReadContext {
  return { scope, windows, now: NOW, goalkeeperIds: async () => goalkeeperIds };
}

describe('MongoDashboardReader, operations areas (admin spec 008, US1)', () => {
  let collections: Record<string, FakeMongoCollection>;
  let reader: MongoDashboardReader;

  beforeEach(() => {
    collections = {};
    const db = {
      collection: (name: string) => (collections[name] ??= createFakeCollection()) as unknown as Collection<Document>,
    } as unknown as Db;
    reader = new MongoDashboardReader(db);
  });
  const collection = (name: string) => (collections[name] ??= createFakeCollection());

  it("counts the week's matches in the scope's time zone and cities", async () => {
    collection('goalkeeperRequests').aggregate.mockReturnValue(
      toArrayResult([{ requestsToday: [{ _id: 'assigned', count: 2 }], requestsWeek: [{ _id: 'assigned', count: 4 }], bookingsToday: [], bookingsWeek: [], bookingsByDay: [] }]),
    );

    const area = await reader.requests(contextFor({ ...MEDELLIN, timeZone: 'America/Bogota' }));

    const pipeline = collection('goalkeeperRequests').aggregate.mock.calls[0]![0] as Document[];
    expect(pipeline[0]).toEqual({ $match: { startsAt: { $gte: windows.week.from, $lt: windows.week.to }, 'match.cityId': { $in: ['medellin'] } } });
    expect(JSON.stringify(pipeline)).toContain('"timezone":"America/Bogota"');
    expect(area.requests.today.byStatus.assigned).toBe(2);
    expect(area.requests.week.total).toBe(4);
    expect(area.bookings.weekByDay.map((day) => day.date)).toEqual(DAYS);
  });

  it('counts the active goalkeepers of the scope, zeros without any', async () => {
    collection('goalkeeperProfiles').aggregate.mockReturnValueOnce(toArrayResult([{ _id: null, active: 4, available: 2, suspended: 1, blocked: 1 }]));
    expect(await reader.goalkeepers(contextFor(MEDELLIN))).toEqual({ active: 4, available: 2, suspended: 1, blocked: 1 });
    expect((collection('goalkeeperProfiles').aggregate.mock.calls[0]![0] as Document[])[0]).toEqual({ $match: { cityId: { $in: ['medellin'] } } });

    collection('goalkeeperProfiles').aggregate.mockReturnValueOnce(toArrayResult([]));
    expect(await reader.goalkeepers(contextFor(PLATFORM))).toEqual({ active: 0, available: 0, suspended: 0, blocked: 0 });
  });

  it("finds the scope's goalkeepers by their profile's city", async () => {
    collection('goalkeeperProfiles').distinct.mockResolvedValue(['gk-1', 'gk-2']);
    expect(await reader.goalkeeperIdsInCities(['medellin'])).toEqual(['gk-1', 'gk-2']);
    expect(collection('goalkeeperProfiles').distinct).toHaveBeenCalledWith('userId', { cityId: { $in: ['medellin'] } });
  });

  it('counts the registrations in progress: all of them without a scope, those of its cities with one', async () => {
    collection('goalkeeperRegistrations').countDocuments.mockResolvedValue(9);
    expect(await reader.registrations(contextFor(PLATFORM))).toEqual({ inProgress: 9 });
    expect(collection('goalkeeperRegistrations').countDocuments).toHaveBeenLastCalledWith({ status: 'in_progress' });

    await reader.registrations(contextFor(MEDELLIN));
    expect(collection('goalkeeperRegistrations').countDocuments).toHaveBeenLastCalledWith({ status: 'in_progress', 'availability.cityId': { $in: ['medellin'] } });
  });

  it('counts the open cases; with a scope, those whose request is in its cities', async () => {
    collection('cases').countDocuments.mockResolvedValue(4);
    expect(await reader.cases(contextFor(PLATFORM))).toEqual({ open: 4 });
    expect(collection('cases').countDocuments).toHaveBeenLastCalledWith({ status: 'open' });

    collection('cases').distinct.mockResolvedValue(['r-1', 'r-2']);
    collection('goalkeeperRequests').distinct.mockResolvedValue(['r-1']);
    collection('cases').countDocuments.mockResolvedValue(1);
    expect(await reader.cases(contextFor(MEDELLIN))).toEqual({ open: 1 });
    expect(collection('cases').distinct).toHaveBeenCalledWith('requestId', { status: 'open' });
    expect(collection('goalkeeperRequests').distinct).toHaveBeenCalledWith('_id', { _id: { $in: ['r-1', 'r-2'] }, 'match.cityId': { $in: ['medellin'] } });
    expect(collection('cases').countDocuments).toHaveBeenLastCalledWith({ status: 'open', requestId: { $in: ['r-1'] } });
  });

  it('counts nothing for a country without cities, without reading', async () => {
    const empty = { ...MEDELLIN, cityId: null, cityIds: [] };
    expect(await reader.cases(contextFor(empty))).toEqual({ open: 0 });
    expect(await reader.registrations(contextFor(empty))).toEqual({ inProgress: 0 });
    expect(await reader.goalkeeperIdsInCities([])).toEqual([]);
    expect(collection('cases').distinct).not.toHaveBeenCalled();
  });

  it('counts the rejected and the stale documents: by country, or by the goalkeepers of a city', async () => {
    collection('invoicingDocuments').countDocuments.mockResolvedValueOnce(2).mockResolvedValueOnce(1);
    expect(await reader.invoicing(contextFor({ ...MEDELLIN, cityId: null, cityIds: ['medellin'] }))).toEqual({ rejected: 2, stale: 1 });
    const [rejected, stale] = collection('invoicingDocuments').countDocuments.mock.calls.map((call) => call[0]);
    expect(rejected).toEqual({ status: 'rejected', countryId: 'co' });
    expect(stale).toEqual({
      countryId: 'co',
      $and: [{ status: { $in: ['pending', 'awaiting_authority'] } }, { createdAt: { $lt: new Date(NOW.getTime() - 24 * 60 * 60_000) } }],
    });

    collection('invoicingDocuments').countDocuments.mockResolvedValue(0);
    await reader.invoicing(contextFor(MEDELLIN, ['gk-1']));
    expect(collection('invoicingDocuments').countDocuments).toHaveBeenLastCalledWith(expect.objectContaining({ goalkeeperId: { $in: ['gk-1'] } }));
    expect(collection('invoicingDocuments').countDocuments.mock.lastCall![0]).not.toHaveProperty('countryId');
  });

  it('counts the pending top-ups: all, by country, or by the goalkeepers of a city', async () => {
    collection('topUps').countDocuments.mockResolvedValue(3);
    expect(await reader.topUps(contextFor(PLATFORM))).toEqual({ pending: 3 });
    expect(collection('topUps').countDocuments).toHaveBeenLastCalledWith({ status: 'pending' });
    await reader.topUps(contextFor({ ...MEDELLIN, cityId: null }));
    expect(collection('topUps').countDocuments).toHaveBeenLastCalledWith({ status: 'pending', countryId: 'co' });
    await reader.topUps(contextFor(MEDELLIN, ['gk-1']));
    expect(collection('topUps').countDocuments).toHaveBeenLastCalledWith({ status: 'pending', goalkeeperId: { $in: ['gk-1'] } });
  });

  it("adds the wallets of the scope's goalkeepers per currency, and every wallet for the platform", async () => {
    collection('wallets').aggregate.mockReturnValue(toArrayResult([{ _id: 'COP', balanceTotal: 10, debtTotal: -5, negativeCount: 1 }]));
    expect(await reader.wallets(contextFor(MEDELLIN, ['gk-1']))).toEqual({ byCurrency: [{ currency: 'COP', balanceTotal: 10, debtTotal: -5, negativeCount: 1 }] });
    expect((collection('wallets').aggregate.mock.calls[0]![0] as Document[])[0]).toEqual({ $match: { _id: { $in: ['gk-1'] } } });
    await reader.wallets(contextFor(PLATFORM, null));
    expect((collection('wallets').aggregate.mock.calls[1]![0] as Document[])[0]).toHaveProperty('$group');
  });

  it('counts no money for a city without goalkeepers, without reading', async () => {
    expect(await reader.invoicing(contextFor(MEDELLIN, []))).toEqual({ rejected: 0, stale: 0 });
    expect(await reader.topUps(contextFor(MEDELLIN, []))).toEqual({ pending: 0 });
    expect(await reader.wallets(contextFor(MEDELLIN, []))).toEqual({ byCurrency: [] });
    expect(collection('wallets').aggregate).not.toHaveBeenCalled();
  });
});
