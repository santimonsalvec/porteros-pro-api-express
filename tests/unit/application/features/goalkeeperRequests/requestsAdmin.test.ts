import { beforeEach, describe, expect, it } from 'vitest';
import type { IRequestAdminReader, RequestDetailRecord, RequestListFilter } from '../../../../../src/application/features/goalkeeperRequests/common/adminPorts.js';
import type { RequestsAdminDependencies } from '../../../../../src/application/features/goalkeeperRequests/common/requestsAdminDependencies.js';
import { GetCheckInPhotoQuery } from '../../../../../src/application/features/goalkeeperRequests/queries/getCheckInPhoto/getCheckInPhotoQuery.js';
import { GetCheckInPhotoQueryHandler } from '../../../../../src/application/features/goalkeeperRequests/queries/getCheckInPhoto/getCheckInPhotoQueryHandler.js';
import { GetRequestAdminQuery } from '../../../../../src/application/features/goalkeeperRequests/queries/getRequestAdmin/getRequestAdminQuery.js';
import { GetRequestAdminQueryHandler } from '../../../../../src/application/features/goalkeeperRequests/queries/getRequestAdmin/getRequestAdminQueryHandler.js';
import { ListRequestsAdminQuery } from '../../../../../src/application/features/goalkeeperRequests/queries/listRequestsAdmin/listRequestsAdminQuery.js';
import { ListRequestsAdminQueryHandler } from '../../../../../src/application/features/goalkeeperRequests/queries/listRequestsAdmin/listRequestsAdminQueryHandler.js';
import { Booking } from '../../../../../src/domain/bookings/booking.js';
import { SupportCase } from '../../../../../src/domain/cases/case.js';
import { GoalkeeperIncident } from '../../../../../src/domain/goalkeepers/goalkeeperIncident.js';
import type { Market } from '../../../../../src/domain/markets/market.js';
import { Rating } from '../../../../../src/domain/ratings/rating.js';
import type { StaffMember } from '../../../../../src/domain/staff/staffMember.js';
import { User } from '../../../../../src/domain/users/user.js';
import type { Zone } from '../../../../../src/domain/zones/zone.js';
import { buildRequest, buildRequestBookings } from '../../../../fixtures/quoteFixtures.js';

const NOW = new Date('2026-10-19T12:00:00.000Z');
const startsAt = new Date('2026-10-19T01:00:00.000Z');
const request = buildRequest('r-1', startsAt);
const [first, second] = buildRequestBookings(request);
const checkInAt = new Date('2026-10-19T00:52:00.000Z');
const held = Booking.rehydrate({
  ...first!,
  status: 'completed',
  goalkeeperId: 'gk-1',
  assignedAt: new Date('2026-10-15T16:20:00.000Z'),
  checkIn: { at: checkInAt, imageId: 'img-1', photoUrl: 'https://res.cloudinary.com/x/c.jpg', location: { latitude: 6.2, longitude: -75.5, accuracyMeters: 12 }, distanceMeters: 40 },
  completedAt: new Date('2026-10-19T02:30:00.000Z'),
  attendance: 'attended',
});
const cancelled = Booking.rehydrate({
  ...second!,
  status: 'cancelled',
  goalkeeperId: 'gk-2',
  assignedAt: new Date('2026-10-16T13:00:00.000Z'),
  endedAt: new Date('2026-10-18T21:10:00.000Z'),
  endReason: 'admin_cancelled',
  cancelledBy: 'admin',
  cancellationNote: 'La cancha cerró',
  cancelledByStaffId: 'staff-user-1',
});

function person(id: string, first: string, last: string) {
  const user = User.createFromExternalIdentity({ id, email: `${id}@x.co`, displayName: null, provider: 'google', subject: id });
  user.completeProfile(first, last, '+57', '3001234567');
  return user;
}

const PEOPLE = [person(request.clientId, 'Laura', 'Gómez'), person('gk-1', 'Juan', 'Pérez'), person('gk-2', 'Ana', 'Ruiz')];

function detailRecord(overrides: Partial<RequestDetailRecord> = {}): RequestDetailRecord {
  return {
    request,
    bookings: [held, cancelled],
    money: new Map([
      [held.id, { charged: 8330, chargedVat: 1583, refunded: 0, refundedVat: 0, currency: 'COP' }],
      [cancelled.id, { charged: 8330, chargedVat: 1583, refunded: 8330, refundedVat: 1583, currency: 'COP' }],
    ]),
    incidents: [],
    ratings: [Rating.create({ id: 'rt-1', bookingId: held.id, requestId: 'r-1', side: 'client', authorId: request.clientId, subjectId: 'gk-1', answer: true, stars: 4, comment: 'Bien', createdAt: NOW })],
    cases: [],
    offersSent: 14,
    ...overrides,
  };
}

describe('the admin request queries (admin spec 006, US1)', () => {
  let listed: RequestListFilter[];
  let marketIdsOfCountry: string[];
  let goalkeeperRequestIds: string[];
  let detail: RequestDetailRecord | null;
  let deps: RequestsAdminDependencies;

  beforeEach(() => {
    listed = [];
    marketIdsOfCountry = ['med', 'bello'];
    goalkeeperRequestIds = ['r-1'];
    detail = detailRecord();
    const reader: IRequestAdminReader = {
      marketIdsOfCountry: async () => marketIdsOfCountry,
      requestIdsOfGoalkeeper: async (_id, limit) => goalkeeperRequestIds.slice(0, limit),
      requestIdsInMarkets: async (ids) => [...ids],
      list: async (filter) => {
        listed.push(filter);
        return {
          totalItems: 1,
          items: [{
            requestId: 'r-1', clientId: request.clientId, startsAt, timeZone: 'America/Bogota', marketId: request.match.marketId, zoneId: request.zoneId,
            goalkeeperCount: 2, counts: { pending: 1, assigned: 1, completed: 0, cancelled: 0, expired: 0 }, total: 120000, currency: 'COP', createdAt: request.createdAt,
          }],
        };
      },
      detail: async () => detail,
      checkInPhoto: async (bookingId, requestId) =>
        bookingId === held.id && (requestId === undefined || requestId === 'r-1') ? { outcome: 'ok', photoUrl: 'https://res.cloudinary.com/x/c.jpg', at: checkInAt } : { outcome: 'booking_not_found' },
    };
    deps = {
      reader,
      users: { getByIds: async (ids) => PEOPLE.filter((user) => ids.includes(user.id)) },
      markets: { getByIds: async (ids) => ids.map((id) => ({ id, name: id === request.match.marketId ? 'Medellín' : id }) as Market) },
      zones: { getManyByIds: async (ids) => ids.map((id) => ({ id, name: 'Laureles' }) as Zone) },
      staff: { findByUserId: async (userId) => (userId === 'staff-user-1' ? ({ displayName: 'Ana Soporte', email: 'ana@porteros.pro' } as StaffMember) : null) },
      clock: { now: () => NOW },
    };
  });

  describe('the list', () => {
    const list = (criteria: Partial<ConstructorParameters<typeof ListRequestsAdminQuery>[0]> = {}) =>
      new ListRequestsAdminQueryHandler(deps).handle(new ListRequestsAdminQuery({ page: 1, pageSize: 20, ...criteria }));

    it('shows each request with its place and client names, assigned count, status and total', async () => {
      expect(await list()).toEqual({
        outcome: 'ok',
        page: {
          page: 1,
          pageSize: 20,
          totalItems: 1,
          totalPages: 1,
          items: [{
            requestId: 'r-1',
            match: { startsAt: startsAt.toISOString(), timeZone: 'America/Bogota', market: { id: request.match.marketId, name: 'Medellín' }, zone: { id: request.zoneId, name: 'Laureles' } },
            client: { userId: request.clientId, name: 'Laura Gómez' },
            goalkeepersRequested: 2,
            goalkeepersAssigned: 1,
            status: 'partially_assigned',
            total: { amount: 120000, currency: 'COP' },
            createdAt: request.createdAt.toISOString(),
          }],
        },
      });
    });

    it('passes the request filters through, a city winning over its country', async () => {
      const from = new Date('2026-10-18T05:00:00.000Z');
      await list({ status: 'searching', zoneId: 'z', clientId: 'c', from, to: NOW });
      await list({ countryId: 'co' });
      await list({ countryId: 'co', marketId: 'med' });

      expect(listed[0]).toMatchObject({ status: 'searching', zoneId: 'z', clientId: 'c', from, to: NOW, page: 1, pageSize: 20 });
      expect(listed[0]!.marketIds).toBeUndefined();
      expect(listed[1]!.marketIds).toEqual(['med', 'bello']);
      expect(listed[2]!.marketIds).toEqual(['med']);
    });

    it("narrows to a goalkeeper's requests, and asks to narrow when they are too many", async () => {
      await list({ goalkeeperId: 'gk-1' });
      expect(listed[0]!.requestIds).toEqual(['r-1']);

      goalkeeperRequestIds = Array.from({ length: 501 }, (_, index) => `r-${index}`);
      expect(await list({ goalkeeperId: 'gk-1' })).toEqual({ outcome: 'search_too_broad' });
    });
  });

  describe('the detail', () => {
    const get = () => new GetRequestAdminQueryHandler(deps).handle(new GetRequestAdminQuery('r-1'));

    it('gives the request, its match and price, and how many goalkeepers were offered it', async () => {
      const result = await get();
      if (result.outcome !== 'ok') throw new Error(result.outcome);

      expect(result.request).toMatchObject({
        requestId: 'r-1',
        status: 'completed',
        client: { userId: request.clientId, name: 'Laura Gómez' },
        match: {
          startsAt: startsAt.toISOString(),
          timeZone: request.match.timeZone,
          market: { id: request.match.marketId, name: 'Medellín' },
          zone: { id: request.zoneId, name: 'Laureles' },
          latitude: request.match.latitude,
          longitude: request.match.longitude,
          goalkeeperCount: 2,
        },
        pricing: { total: request.pricing.total, currency: request.pricing.currency },
        freeCancellationUntil: request.freeCancellationUntil().toISOString(),
        partialFulfillment: request.partialFulfillment,
        offersSent: 14,
      });
    });

    it('gives each booking with its goalkeeper, check-in without the photo, money, ratings and cases', async () => {
      const result = await get();
      if (result.outcome !== 'ok') throw new Error(result.outcome);
      const [played] = result.request.bookings;

      expect(played).toMatchObject({
        bookingId: held.id,
        status: 'completed',
        goalkeeper: { userId: 'gk-1', name: 'Juan Pérez' },
        checkIn: { at: checkInAt.toISOString(), distanceMeters: 40, accuracyMeters: 12, onTime: true, hasPhoto: true },
        attendance: 'attended',
        money: { charged: 8330, chargedVat: 1583, refunded: 0, refundedVat: 0, currency: 'COP' },
        ratings: [{ ratingId: 'rt-1', side: 'client', stars: 4, answer: true, comment: 'Bien' }],
        ended: null,
      });
      expect(JSON.stringify(result)).not.toContain('cloudinary');
    });

    it('names who cancelled as an administrator, with the internal reason', async () => {
      const result = await get();
      if (result.outcome !== 'ok') throw new Error(result.outcome);

      expect(result.request.bookings[1]!.ended).toEqual({
        at: '2026-10-18T21:10:00.000Z',
        reason: 'admin_cancelled',
        by: 'admin',
        note: 'La cancha cerró',
        staff: { userId: 'staff-user-1', name: 'Ana Soporte' },
      });
    });

    it('gives the incidents with their penalties and reversals', async () => {
      detail = detailRecord({
        incidents: [GoalkeeperIncident.rehydrate({
          id: 'w-1', kind: 'withdrawal', goalkeeperId: 'gk-2', bookingId: cancelled.id, requestId: 'r-1', marketId: 'city-cali', startsAt, occurredAt: NOW, noticeMinutes: 1380, late: true,
          reason: 'Me lesioné', replacementBookingId: 'r-1-b3',
          penalties: [{ id: 'p-1', kind: 'late', days: 3, startsAt: NOW, endsAt: new Date('2026-10-22T12:00:00.000Z'), reversal: { by: 'staff-user-1', at: NOW, reason: 'Lluvia' } }],
          moneyReversal: null, forgivenAt: null,
        })],
        cases: [SupportCase.open({ id: 'case-1', type: 'goalkeeper_no_show', bookingId: cancelled.id, requestId: 'r-1', clientId: request.clientId, goalkeeperId: 'gk-2', ratingId: 'rt-9', checkIn: null, noShowIncidentId: null, createdAt: NOW })],
      });
      const result = await get();
      if (result.outcome !== 'ok') throw new Error(result.outcome);

      expect(result.request.bookings[1]).toMatchObject({
        incidents: [{
          incidentId: 'w-1', kind: 'withdrawal', noticeMinutes: 1380, late: true, reason: 'Me lesioné', replacementBookingId: 'r-1-b3', forgiven: false,
          penalties: [{ kind: 'late', days: 3, endsAt: '2026-10-22T12:00:00.000Z', reversal: { at: NOW.toISOString(), by: { userId: 'staff-user-1', name: 'Ana Soporte' }, reason: 'Lluvia' } }],
          moneyReversal: null,
        }],
        cases: [{ caseId: 'case-1', type: 'goalkeeper_no_show', status: 'open' }],
      });
    });

    it('says the offers are no longer known once they expired (90 days), but still 0 before', async () => {
      detail = detailRecord({ offersSent: 0 });
      const recent = await get();
      if (recent.outcome !== 'ok') throw new Error(recent.outcome);
      expect(recent.request.offersSent).toBe(0);

      // The request was created on 2026-09-20; 91 days later its offers are gone.
      detail = detailRecord({ offersSent: 0 });
      deps.clock = { now: () => new Date('2026-12-20T13:00:00.000Z') };
      const result = await get();
      if (result.outcome !== 'ok') throw new Error(result.outcome);

      expect(result.request.offersSent).toBeNull();
    });

    it('answers request_not_found for an unknown request', async () => {
      detail = null;
      expect(await get()).toEqual({ outcome: 'request_not_found' });
    });
  });

  describe('the check-in photo', () => {
    it('gives the photo of a booking, by request or by booking alone', async () => {
      const handler = new GetCheckInPhotoQueryHandler(deps);

      expect(await handler.handle(new GetCheckInPhotoQuery(held.id, 'r-1'))).toEqual({
        outcome: 'ok',
        photo: { photoUrl: 'https://res.cloudinary.com/x/c.jpg', at: checkInAt.toISOString() },
      });
      expect(await handler.handle(new GetCheckInPhotoQuery('other', 'r-1'))).toEqual({ outcome: 'booking_not_found' });
    });
  });
});
