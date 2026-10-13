import type { IQueryHandler } from '../../../../common/mediator/types.js';
import { requestStatusFromCounts } from '../../../../../domain/bookings/requestStatus.js';
import { pageOf } from '../../../geography/common/views.js';
import { placeNames, personNames } from '../../common/adminNames.js';
import type { RequestsAdminDependencies } from '../../common/requestsAdminDependencies.js';
import { ListRequestsAdminQuery, type ListRequestsAdminResult } from './listRequestsAdminQuery.js';

/** A goalkeeper with more requests than this asks to narrow the dates (research §6). */
export const MAX_GOALKEEPER_REQUESTS = 500;

export class ListRequestsAdminQueryHandler implements IQueryHandler<ListRequestsAdminQuery, ListRequestsAdminResult> {
  constructor(private readonly deps: RequestsAdminDependencies) {}

  async handle({ criteria }: ListRequestsAdminQuery): Promise<ListRequestsAdminResult> {
    const cityIds = criteria.cityId ? [criteria.cityId] : criteria.countryId ? await this.deps.reader.cityIdsOfCountry(criteria.countryId) : undefined;
    let requestIds: string[] | undefined;
    if (criteria.goalkeeperId) {
      requestIds = await this.deps.reader.requestIdsOfGoalkeeper(criteria.goalkeeperId, MAX_GOALKEEPER_REQUESTS + 1);
      if (requestIds.length > MAX_GOALKEEPER_REQUESTS) return { outcome: 'search_too_broad' };
    }
    const { items, totalItems } = await this.deps.reader.list({
      status: criteria.status,
      zoneId: criteria.zoneId,
      cityIds,
      clientId: criteria.clientId,
      requestIds,
      from: criteria.from,
      to: criteria.to,
      page: criteria.page,
      pageSize: criteria.pageSize,
    });
    const [people, places] = await Promise.all([
      personNames(this.deps, items.map((item) => item.clientId)),
      placeNames(this.deps, items.map((item) => item.cityId), items.map((item) => item.zoneId)),
    ]);
    const rows = items.map((item) => ({
      requestId: item.requestId,
      match: { startsAt: item.startsAt.toISOString(), timeZone: item.timeZone, city: places.city(item.cityId), zone: places.zone(item.zoneId) },
      client: people(item.clientId),
      goalkeepersRequested: item.goalkeeperCount,
      goalkeepersAssigned: item.counts.assigned + item.counts.completed,
      status: requestStatusFromCounts(item.counts),
      total: { amount: item.total, currency: item.currency },
      createdAt: item.createdAt.toISOString(),
    }));
    return { outcome: 'ok', page: pageOf(rows, criteria.page, criteria.pageSize, totalItems) };
  }
}
