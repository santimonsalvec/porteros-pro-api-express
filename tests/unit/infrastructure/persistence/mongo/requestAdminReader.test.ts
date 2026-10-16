import { describe, expect, it } from 'vitest';
import type { Collection, Db, Document } from 'mongodb';
import { Booking } from '../../../../../src/domain/bookings/booking.js';
import { SupportCase } from '../../../../../src/domain/cases/case.js';
import { GoalkeeperIncident } from '../../../../../src/domain/goalkeepers/goalkeeperIncident.js';
import { Rating } from '../../../../../src/domain/ratings/rating.js';
import { bookingToDocument } from '../../../../../src/infrastructure/persistence/mongo/bookingRepository.js';
import { caseToDocument } from '../../../../../src/infrastructure/persistence/mongo/caseRepository.js';
import { incidentToDocument } from '../../../../../src/infrastructure/persistence/mongo/goalkeeperIncidentRepository.js';
import { requestToDocument } from '../../../../../src/infrastructure/persistence/mongo/goalkeeperRequestRepository.js';
import { ratingToDocument } from '../../../../../src/infrastructure/persistence/mongo/ratingRepository.js';
import { RequestAdminReader } from '../../../../../src/infrastructure/persistence/mongo/requestAdminReader.js';
import { createFakeCollection, toArrayCursor, toArrayResult, type FakeMongoCollection } from '../../../../fakes/fakeMongoCollection.js';
import { buildRequest, buildRequestBookings } from '../../../../fixtures/quoteFixtures.js';

const startsAt = new Date('2026-10-19T01:00:00.000Z');
const request = buildRequest('r-1', startsAt);
const [pending, other] = buildRequestBookings(request);
const assignedAt = new Date('2026-10-15T16:20:00.000Z');
const held = Booking.rehydrate({
  ...other!,
  status: 'assigned',
  goalkeeperId: 'gk-1',
  assignedAt,
  checkIn: { at: new Date('2026-10-19T00:52:00.000Z'), imageId: 'img-1', photoUrl: 'https://res.cloudinary.com/x/c.jpg', location: null, distanceMeters: 40 },
});

function readerWith(collections: Record<string, FakeMongoCollection>) {
  const db = { collection: (name: string) => (collections[name] ?? createFakeCollection()) as unknown as Collection<Document> } as unknown as Db;
  return new RequestAdminReader(db);
}

describe('RequestAdminReader (mocked driver, admin spec 006)', () => {
  it('resolves a country into its markets (spec 031)', async () => {
    const markets = createFakeCollection();
    markets.find.mockReturnValue(toArrayResult([{ _id: 'med' }, { _id: 'bog' }]));

    expect(await readerWith({ markets }).marketIdsOfCountry('co')).toEqual(['med', 'bog']);
    expect(markets.find).toHaveBeenCalledWith({ countryId: 'co' }, { projection: { _id: 1 } });
  });

  it("resolves a goalkeeper into the requests they held a booking of, up to the limit", async () => {
    const bookings = createFakeCollection();
    bookings.distinct.mockResolvedValue(['r-1', 'r-2', 'r-3']);

    expect(await readerWith({ bookings }).requestIdsOfGoalkeeper('gk-1', 2)).toEqual(['r-1', 'r-2']);
    expect(bookings.distinct).toHaveBeenCalledWith('requestId', { goalkeeperId: 'gk-1' });
  });

  it('keeps the requests of some cities, without asking for nothing', async () => {
    const goalkeeperRequests = createFakeCollection();
    goalkeeperRequests.find.mockReturnValue(toArrayResult([{ _id: 'r-2' }]));
    const reader = readerWith({ goalkeeperRequests });

    expect(await reader.requestIdsInMarkets(['r-1', 'r-2'], ['med'])).toEqual(['r-2']);
    expect(goalkeeperRequests.find).toHaveBeenCalledWith({ _id: { $in: ['r-1', 'r-2'] }, 'match.marketId': { $in: ['med'] } }, { projection: { _id: 1 } });
    expect(await reader.requestIdsInMarkets([], ['med'])).toEqual([]);
    expect(await reader.requestIdsInMarkets(['r-1'], [])).toEqual([]);
    expect(goalkeeperRequests.find).toHaveBeenCalledTimes(1);
  });

  it('lists a page of requests with their booking counts', async () => {
    const goalkeeperRequests = createFakeCollection();
    goalkeeperRequests.aggregate.mockReturnValue(
      toArrayResult([
        {
          items: [
            {
              _id: 'r-1',
              clientId: 'c-1',
              startsAt,
              zoneId: 'laureles',
              match: { marketId: 'med', timeZone: 'America/Bogota', goalkeeperCount: 2 },
              pricing: { total: 120000, currency: 'COP' },
              createdAt: request.createdAt,
              pending: 1,
              assigned: 1,
              completed: 0,
              cancelled: 0,
              expired: 0,
            },
          ],
          total: [{ count: 9 }],
        },
      ]),
    );

    const result = await readerWith({ goalkeeperRequests }).list({ marketIds: ['med'], page: 1, pageSize: 20 });

    expect(result).toEqual({
      totalItems: 9,
      items: [
        {
          requestId: 'r-1',
          clientId: 'c-1',
          startsAt,
          timeZone: 'America/Bogota',
          marketId: 'med',
          zoneId: 'laureles',
          goalkeeperCount: 2,
          counts: { pending: 1, assigned: 1, completed: 0, cancelled: 0, expired: 0 },
          total: 120000,
          currency: 'COP',
          createdAt: request.createdAt,
        },
      ],
    });
    expect(goalkeeperRequests.aggregate.mock.calls[0]![0][0]).toEqual({ $match: { 'match.marketId': { $in: ['med'] } } });
  });

  it('answers no requests when a filter resolved to nothing, without asking Mongo', async () => {
    const goalkeeperRequests = createFakeCollection();
    const reader = readerWith({ goalkeeperRequests });

    expect(await reader.list({ marketIds: [], page: 1, pageSize: 20 })).toEqual({ items: [], totalItems: 0 });
    expect(await reader.list({ requestIds: [], page: 1, pageSize: 20 })).toEqual({ items: [], totalItems: 0 });
    expect(goalkeeperRequests.aggregate).not.toHaveBeenCalled();
  });

  describe('the facts of one request', () => {
    const incident = GoalkeeperIncident.rehydrate({
      id: 'w-1',
      kind: 'withdrawal',
      goalkeeperId: 'gk-2',
      bookingId: pending!.id,
      requestId: 'r-1',
      marketId: 'city-cali',
      startsAt,
      occurredAt: new Date('2026-10-18T02:00:00.000Z'),
      noticeMinutes: 1380,
      late: true,
      reason: 'Me lesioné',
      replacementBookingId: null,
      penalties: [],
      moneyReversal: null,
      forgivenAt: null,
    });
    const rating = Rating.create({ id: 'rt-1', bookingId: held.id, requestId: 'r-1', side: 'client', authorId: 'c-1', subjectId: 'gk-1', answer: false, stars: 2, comment: 'Llegó tarde', createdAt: startsAt });
    const opened = SupportCase.open({ id: 'case-1', type: 'late_attendance_claim', bookingId: held.id, requestId: 'r-1', clientId: 'c-1', goalkeeperId: 'gk-1', ratingId: 'rt-1', checkIn: null, noShowIncidentId: null, createdAt: startsAt });

    function collections() {
      const goalkeeperRequests = createFakeCollection();
      const bookings = createFakeCollection();
      const balanceMovements = createFakeCollection();
      const goalkeeperIncidents = createFakeCollection();
      const ratings = createFakeCollection();
      const cases = createFakeCollection();
      const notifications = createFakeCollection();
      goalkeeperRequests.findOne.mockResolvedValue(requestToDocument(request));
      bookings.find.mockReturnValue(toArrayCursor([bookingToDocument(pending!), bookingToDocument(held)]));
      balanceMovements.find.mockReturnValue(
        toArrayResult([
          { causeKey: `commission:${held.id}`, amount: -8330, currency: 'COP' },
          { causeKey: `commission_vat:${held.id}`, amount: -1583, currency: 'COP' },
        ]),
      );
      goalkeeperIncidents.find.mockReturnValue(toArrayResult([incidentToDocument(incident)]));
      ratings.find.mockReturnValue(toArrayResult([ratingToDocument(rating)]));
      cases.find.mockReturnValue(toArrayResult([caseToDocument(opened)]));
      notifications.countDocuments.mockResolvedValue(14);
      return { goalkeeperRequests, bookings, balanceMovements, goalkeeperIncidents, ratings, cases, notifications };
    }

    it('reads the request, its bookings, their money, incidents, ratings, cases and offers', async () => {
      const all = collections();

      const detail = await readerWith(all).detail('r-1');

      expect(detail!.request.id).toBe('r-1');
      expect(detail!.bookings.map((booking) => booking.id)).toEqual([pending!.id, held.id]);
      expect(detail!.money).toEqual(new Map([[held.id, { charged: 8330, chargedVat: 1583, refunded: 0, refundedVat: 0, currency: 'COP' }]]));
      expect(detail!.incidents.map((item) => item.id)).toEqual(['w-1']);
      expect(detail!.ratings.map((item) => item.id)).toEqual(['rt-1']);
      expect(detail!.cases.map((item) => item.id)).toEqual(['case-1']);
      expect(detail!.offersSent).toBe(14);

      const ids = [pending!.id, held.id];
      expect(all.balanceMovements.find).toHaveBeenCalledWith({
        causeKey: { $in: ids.flatMap((id) => [`commission:${id}`, `commission_vat:${id}`, `commission_refund:${id}`, `commission_vat_refund:${id}`]) },
      });
      expect(all.goalkeeperIncidents.find).toHaveBeenCalledWith({ kind: { $in: ['withdrawal', 'no_show'] }, bookingId: { $in: ids } });
      expect(all.ratings.find).toHaveBeenCalledWith({ bookingId: { $in: ids } });
      expect(all.cases.find).toHaveBeenCalledWith({ bookingId: { $in: ids } });
      expect(all.notifications.countDocuments).toHaveBeenCalledWith({ requestId: 'r-1', type: 'booking.available' });
    });

    it('adds up refunds', async () => {
      const all = collections();
      all.balanceMovements.find.mockReturnValue(
        toArrayResult([
          { causeKey: `commission:${held.id}`, amount: -8330, currency: 'COP' },
          { causeKey: `commission_refund:${held.id}`, amount: 8330, currency: 'COP' },
          { causeKey: `commission_vat_refund:${held.id}`, amount: 1583, currency: 'COP' },
        ]),
      );

      const detail = await readerWith(all).detail('r-1');

      expect(detail!.money.get(held.id)).toEqual({ charged: 8330, chargedVat: 0, refunded: 8330, refundedVat: 1583, currency: 'COP' });
    });

    it('is null for an unknown request', async () => {
      const goalkeeperRequests = createFakeCollection();
      goalkeeperRequests.findOne.mockResolvedValue(null);

      expect(await readerWith({ goalkeeperRequests }).detail('nope')).toBeNull();
    });
  });

  describe('the check-in photo', () => {
    it('reads the photo of a booking of that request', async () => {
      const bookings = createFakeCollection();
      bookings.findOne.mockResolvedValue(bookingToDocument(held));

      expect(await readerWith({ bookings }).checkInPhoto(held.id, 'r-1')).toEqual({
        outcome: 'ok',
        photoUrl: 'https://res.cloudinary.com/x/c.jpg',
        at: new Date('2026-10-19T00:52:00.000Z'),
      });
    });

    it("refuses a booking of another request, and a booking with no check-in", async () => {
      const bookings = createFakeCollection();
      bookings.findOne.mockResolvedValueOnce(bookingToDocument(held)).mockResolvedValueOnce(bookingToDocument(pending!)).mockResolvedValueOnce(null);
      const reader = readerWith({ bookings });

      expect(await reader.checkInPhoto(held.id, 'r-other')).toEqual({ outcome: 'booking_not_found' });
      expect(await reader.checkInPhoto(pending!.id)).toEqual({ outcome: 'check_in_not_found' });
      expect(await reader.checkInPhoto('nope')).toEqual({ outcome: 'booking_not_found' });
    });
  });
});
