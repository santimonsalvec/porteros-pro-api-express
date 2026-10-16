import { beforeEach, describe, expect, it } from 'vitest';
import type { CasesAdminDependencies } from '../../../../../src/application/features/cases/common/casesAdminDependencies.js';
import { GetCaseAdminQuery } from '../../../../../src/application/features/cases/queries/getCaseAdmin/getCaseAdminQuery.js';
import { GetCaseAdminQueryHandler } from '../../../../../src/application/features/cases/queries/getCaseAdmin/getCaseAdminQueryHandler.js';
import { ListCasesAdminQuery } from '../../../../../src/application/features/cases/queries/listCasesAdmin/listCasesAdminQuery.js';
import { ListCasesAdminQueryHandler } from '../../../../../src/application/features/cases/queries/listCasesAdmin/listCasesAdminQueryHandler.js';
import type { BookingView, RequestDetail } from '../../../../../src/application/features/goalkeeperRequests/common/adminViews.js';
import type { CaseListFilter } from '../../../../../src/application/features/cases/common/ports.js';
import { SupportCase } from '../../../../../src/domain/cases/case.js';
import type { Market } from '../../../../../src/domain/markets/market.js';
import { Rating } from '../../../../../src/domain/ratings/rating.js';
import type { StaffMember } from '../../../../../src/domain/staff/staffMember.js';
import { User } from '../../../../../src/domain/users/user.js';
import type { Zone } from '../../../../../src/domain/zones/zone.js';
import { buildRequest } from '../../../../fixtures/quoteFixtures.js';

const AT = new Date('2026-10-19T15:00:00.000Z');
const request = buildRequest('q-1', new Date('2026-10-17T00:00:00.000Z'));
const opened = SupportCase.open({
  id: 'c-1', type: 'late_attendance_claim', bookingId: 'b-1', requestId: 'q-1', clientId: request.clientId, goalkeeperId: 'gk-1', ratingId: 'rt-1',
  checkIn: { at: new Date('2026-10-16T23:52:00.000Z'), imageId: 'img', photoUrl: 'https://res.cloudinary.com/x/c.jpg', location: null, distanceMeters: 40 },
  noShowIncidentId: null, createdAt: AT,
});
const resolved = opened.resolve({ by: 'staff-user-1', at: new Date('2026-10-20T14:10:00.000Z'), note: 'Llegó a tiempo' });

function person(id: string, first: string, last: string) {
  const user = User.createFromExternalIdentity({ id, email: `${id}@x.co`, displayName: null, provider: 'google', subject: id });
  user.completeProfile(first, last, '+57', '3001234567');
  return user;
}

const booking = { bookingId: 'b-1', status: 'completed', checkIn: { at: '2026-10-16T23:52:00.000Z', distanceMeters: 40, accuracyMeters: null, onTime: true, hasPhoto: true }, incidents: [] } as unknown as BookingView;

describe('the admin case queries (admin spec 006, US2)', () => {
  let searched: CaseListFilter[];
  let cases: SupportCase[];
  let deps: CasesAdminDependencies;

  beforeEach(() => {
    searched = [];
    cases = [opened];
    deps = {
      cases: {
        search: async (filter) => {
          searched.push(filter);
          return cases;
        },
        countMatching: async () => cases.length,
        requestIdsMatching: async () => ['q-1', 'q-2'],
        getById: async (id) => cases.find((item) => item.id === id) ?? null,
      },
      ratings: { getById: async () => Rating.create({ id: 'rt-1', bookingId: 'b-1', requestId: 'q-1', side: 'client', authorId: request.clientId, subjectId: 'gk-1', answer: true, stars: 2, comment: 'Llegó tarde', createdAt: AT }) },
      requests: { findByIds: async (ids) => (ids.includes('q-1') ? [request] : []) },
      requestReader: { marketIdsOfCountry: async () => ['med'], requestIdsInMarkets: async (ids) => ids.filter((id) => id === 'q-1') },
      requestDetail: async (requestId) =>
        requestId === 'q-1'
          ? { outcome: 'ok', request: { requestId: 'q-1', status: 'completed', bookings: [booking] } as unknown as RequestDetail }
          : { outcome: 'request_not_found' },
      users: { getByIds: async (ids) => [person(request.clientId, 'Laura', 'Gómez'), person('gk-1', 'Juan', 'Pérez')].filter((user) => ids.includes(user.id)) },
      markets: { getByIds: async (ids) => ids.map((id) => ({ id, name: 'Medellín' }) as unknown as Market) },
      zones: { getManyByIds: async (ids) => ids.map((id) => ({ id, name: 'Laureles' }) as Zone) },
      staff: { findByUserId: async (userId) => (userId === 'staff-user-1' ? ({ displayName: 'Ana Soporte' } as StaffMember) : null) },
    };
  });

  const list = (criteria: Partial<ConstructorParameters<typeof ListCasesAdminQuery>[0]> = {}) =>
    new ListCasesAdminQueryHandler(deps).handle(new ListCasesAdminQuery({ page: 1, pageSize: 20, ...criteria }));

  it('lists cases with their match, client and goalkeeper', async () => {
    const result = await list({ status: 'open' });

    expect(result).toMatchObject({ outcome: 'ok', page: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } });
    if (result.outcome !== 'ok') throw new Error();
    expect(result.page.items[0]).toEqual({
      caseId: 'c-1',
      type: 'late_attendance_claim',
      status: 'open',
      bookingId: 'b-1',
      requestId: 'q-1',
      clientId: request.clientId,
      goalkeeperId: 'gk-1',
      noShowIncidentId: null,
      createdAt: AT.toISOString(),
      resolution: null,
      match: { startsAt: request.startsAt.toISOString(), timeZone: request.match.timeZone, market: { id: request.match.marketId, name: 'Medellín' }, zone: { id: request.zoneId, name: 'Laureles' } },
      client: { userId: request.clientId, name: 'Laura Gómez' },
      goalkeeper: { userId: 'gk-1', name: 'Juan Pérez' },
    });
    expect(searched[0]).toEqual({ status: 'open', type: undefined, from: undefined, to: undefined, requestIds: undefined, order: 'default' });
  });

  it('passes the type, dates and order, and narrows a country to its requests', async () => {
    const from = new Date('2026-10-01T05:00:00.000Z');
    await list({ type: 'goalkeeper_no_show', from, to: AT, order: 'oldest', countryId: 'co' });

    expect(searched[0]).toEqual({ status: null, type: 'goalkeeper_no_show', from, to: AT, requestIds: ['q-1'], order: 'oldest' });
  });

  it('names who resolved a case', async () => {
    cases = [resolved];
    const result = await list();
    if (result.outcome !== 'ok') throw new Error();

    expect(result.page.items[0]!.resolution).toEqual({ by: { userId: 'staff-user-1', name: 'Ana Soporte' }, at: '2026-10-20T14:10:00.000Z', note: 'Llegó a tiempo' });
  });

  describe('the detail', () => {
    const get = (id: string) => new GetCaseAdminQueryHandler(deps).handle(new GetCaseAdminQuery(id));

    it('gives the case with its booking (check-in without the photo), the rating and the names', async () => {
      const result = await get('c-1');
      if (result.outcome !== 'ok') throw new Error(result.outcome);

      expect(result.case).toMatchObject({
        caseId: 'c-1',
        client: { name: 'Laura Gómez' },
        goalkeeper: { name: 'Juan Pérez' },
        rating: { side: 'client', answer: true, stars: 2, comment: 'Llegó tarde' },
        checkIn: { at: '2026-10-16T23:52:00.000Z', distanceMeters: 40, hasPhoto: true },
        booking,
        requestStatus: 'completed',
      });
      expect(JSON.stringify(result)).not.toContain('cloudinary');
    });

    it('answers case_not_found for an unknown case', async () => {
      expect(await get('nope')).toEqual({ outcome: 'case_not_found' });
    });
  });
});
