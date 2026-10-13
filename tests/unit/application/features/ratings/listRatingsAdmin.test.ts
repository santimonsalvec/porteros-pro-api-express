import { describe, expect, it } from 'vitest';
import type { RatingListFilter } from '../../../../../src/application/features/ratings/common/adminPorts.js';
import { ListRatingsAdminQuery } from '../../../../../src/application/features/ratings/queries/listRatingsAdmin/listRatingsAdminQuery.js';
import { ListRatingsAdminQueryHandler } from '../../../../../src/application/features/ratings/queries/listRatingsAdmin/listRatingsAdminQueryHandler.js';
import type { City } from '../../../../../src/domain/locations/city.js';
import { Rating } from '../../../../../src/domain/ratings/rating.js';
import { User } from '../../../../../src/domain/users/user.js';
import { buildRequest } from '../../../../fixtures/quoteFixtures.js';

const AT = new Date('2026-10-19T15:00:00.000Z');
const request = buildRequest('q-1', new Date('2026-10-17T00:00:00.000Z'));
const byClient = Rating.create({ id: 'rt-1', bookingId: 'b-1', requestId: 'q-1', side: 'client', authorId: request.clientId, subjectId: 'gk-1', answer: false, stars: 2, comment: 'Llegó tarde', createdAt: AT });
const byGoalkeeper = Rating.create({ id: 'rt-2', bookingId: 'b-1', requestId: 'q-1', side: 'goalkeeper', authorId: 'gk-1', subjectId: request.clientId, answer: true, stars: 5, comment: null, createdAt: AT });

function person(id: string, first: string, last: string) {
  const user = User.createFromExternalIdentity({ id, email: `${id}@x.co`, displayName: null, provider: 'google', subject: id });
  user.completeProfile(first, last, '+57', '3001234567');
  return user;
}

describe('the admin rating list (admin spec 006, US4)', () => {
  it('shows who rated whom with their roles, the match and the case each one opened', async () => {
    const filters: RatingListFilter[] = [];
    const handler = new ListRatingsAdminQueryHandler({
      reader: {
        list: async (filter) => {
          filters.push(filter);
          return { items: [byClient, byGoalkeeper], totalItems: 2 };
        },
        casesOpenedBy: async () => new Map([['rt-1', 'case-1']]),
      },
      requests: { findByIds: async () => [request] },
      users: { getByIds: async () => [person(request.clientId, 'Laura', 'Gómez'), person('gk-1', 'Juan', 'Pérez')] },
      cities: { getByIds: async (ids) => ids.map((id) => ({ id, name: 'Medellín' }) as City) },
    });

    const result = await handler.handle(new ListRatingsAdminQuery({ goalkeeperId: 'gk-1', starsMax: 2, page: 1, pageSize: 20 }));

    expect(filters[0]).toMatchObject({ goalkeeperId: 'gk-1', starsMax: 2, page: 1, pageSize: 20 });
    expect(result.page).toMatchObject({ totalItems: 2, totalPages: 1 });
    expect(result.page.items[0]).toEqual({
      ratingId: 'rt-1',
      side: 'client',
      author: { userId: request.clientId, name: 'Laura Gómez', role: 'client' },
      subject: { userId: 'gk-1', name: 'Juan Pérez', role: 'goalkeeper' },
      stars: 2,
      answer: false,
      comment: 'Llegó tarde',
      createdAt: AT.toISOString(),
      match: { startsAt: request.startsAt.toISOString(), timeZone: request.match.timeZone, city: { id: request.match.cityId, name: 'Medellín' } },
      requestId: 'q-1',
      bookingId: 'b-1',
      caseId: 'case-1',
    });
    expect(result.page.items[1]).toMatchObject({ author: { role: 'goalkeeper' }, subject: { role: 'client' }, caseId: null, comment: null });
  });
});
