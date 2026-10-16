import { describe, expect, it } from 'vitest';
import type { CasesAdminDependencies } from '../../../../../src/application/features/cases/common/casesAdminDependencies.js';
import { GetCaseAdminQuery } from '../../../../../src/application/features/cases/queries/getCaseAdmin/getCaseAdminQuery.js';
import { GetCaseAdminQueryHandler } from '../../../../../src/application/features/cases/queries/getCaseAdmin/getCaseAdminQueryHandler.js';
import { personNames, placeNames } from '../../../../../src/application/features/goalkeeperRequests/common/adminNames.js';
import { SupportCase } from '../../../../../src/domain/cases/case.js';

const AT = new Date('2026-10-19T15:00:00.000Z');
const opened = SupportCase.open({
  id: 'c-1', type: 'payment_not_received', bookingId: 'b-1', requestId: 'gone', clientId: 'c-1', goalkeeperId: 'gk-1', ratingId: 'rt-gone',
  checkIn: null, noShowIncidentId: null, createdAt: AT,
});

describe('the admin case detail with pieces missing (admin spec 006)', () => {
  it('has no rating, no check-in, no booking and no match when they are gone, nor names for unknown people', async () => {
    const deps: CasesAdminDependencies = {
      cases: { search: async () => [], countMatching: async () => 0, requestIdsMatching: async () => [], getById: async () => opened },
      ratings: { getById: async () => null },
      requests: { findByIds: async () => [] },
      requestReader: { marketIdsOfCountry: async () => [], requestIdsInMarkets: async () => [] },
      requestDetail: async () => ({ outcome: 'request_not_found' }),
      users: { getByIds: async () => [] },
      markets: { getByIds: async () => [] },
      zones: { getManyByIds: async () => [] },
      staff: { findByUserId: async () => null },
    };

    const result = await new GetCaseAdminQueryHandler(deps).handle(new GetCaseAdminQuery('c-1'));

    expect(result).toMatchObject({
      outcome: 'ok',
      case: { rating: null, checkIn: null, booking: null, requestStatus: null, match: null, client: { userId: 'c-1', name: null }, goalkeeper: { userId: 'gk-1', name: null } },
    });
  });

  it('asks for no names nor places when there are none', async () => {
    const asked: string[] = [];
    const deps = {
      users: { getByIds: async () => (asked.push('users'), []) },
      markets: { getByIds: async () => (asked.push('cities'), []) },
      zones: { getManyByIds: async () => (asked.push('zones'), []) },
    };

    expect((await personNames(deps, []))('x')).toEqual({ userId: 'x', name: null });
    expect((await placeNames(deps, [], [])).market('med')).toEqual({ id: 'med', name: null });
    expect(asked).toEqual([]);
  });
});
