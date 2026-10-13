import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { IUserRepository } from '../../../auth/common/ports.js';
import { pageOf } from '../../../geography/common/views.js';
import { personNames, placeNames } from '../../../goalkeeperRequests/common/adminNames.js';
import type { IGoalkeeperRequestRepository } from '../../../goalkeeperRequests/common/ports.js';
import type { ICityRepository } from '../../../locations/common/ports.js';
import type { IRatingAdminReader } from '../../common/adminPorts.js';
import { ListRatingsAdminQuery, type ListRatingsAdminResult } from './listRatingsAdminQuery.js';

export interface ListRatingsAdminDependencies {
  reader: IRatingAdminReader;
  requests: Pick<IGoalkeeperRequestRepository, 'findByIds'>;
  users: Pick<IUserRepository, 'getByIds'>;
  cities: Pick<ICityRepository, 'getByIds'>;
}

export class ListRatingsAdminQueryHandler implements IQueryHandler<ListRatingsAdminQuery, ListRatingsAdminResult> {
  constructor(private readonly deps: ListRatingsAdminDependencies) {}

  async handle({ criteria }: ListRatingsAdminQuery): Promise<ListRatingsAdminResult> {
    const { items, totalItems } = await this.deps.reader.list(criteria);
    const requests = items.length > 0 ? await this.deps.requests.findByIds([...new Set(items.map((rating) => rating.requestId))]) : [];
    const requestsById = new Map(requests.map((request) => [request.id, request]));
    const [people, places, cases] = await Promise.all([
      personNames(this.deps, items.flatMap((rating) => [rating.authorId, rating.subjectId])),
      placeNames({ ...this.deps, zones: { getManyByIds: async () => [] } }, requests.map((request) => request.match.cityId), []),
      this.deps.reader.casesOpenedBy(items),
    ]);
    const rows = items.map((rating) => {
      const request = requestsById.get(rating.requestId);
      const authorRole = rating.side;
      const subjectRole = rating.side === 'client' ? 'goalkeeper' : 'client';
      return {
        ratingId: rating.id,
        side: rating.side,
        author: { ...people(rating.authorId), role: authorRole },
        subject: { ...people(rating.subjectId), role: subjectRole },
        stars: rating.stars,
        answer: rating.answer,
        comment: rating.comment,
        createdAt: rating.createdAt.toISOString(),
        match: request ? { startsAt: request.startsAt.toISOString(), timeZone: request.match.timeZone, city: places.city(request.match.cityId) } : null,
        requestId: rating.requestId,
        bookingId: rating.bookingId,
        caseId: cases.get(rating.id) ?? null,
      } as const;
    });
    return { outcome: 'ok', page: pageOf(rows, criteria.page, criteria.pageSize, totalItems) };
  }
}
