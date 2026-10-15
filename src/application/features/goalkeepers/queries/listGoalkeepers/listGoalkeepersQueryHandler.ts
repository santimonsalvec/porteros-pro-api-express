import type { IQueryHandler } from '../../../../common/mediator/types.js';
import { pageOf } from '../../../geography/common/views.js';
import { userName } from '../../../users/common/userViewing.js';
import type { GoalkeepersAdminDependencies } from '../../common/goalkeepersAdminDependencies.js';
import { ListGoalkeepersQuery, type ListGoalkeepersResult } from './listGoalkeepersQuery.js';

/** A search that finds more users than this asks to be narrowed (research §5). */
export const MAX_SEARCHED_USERS = 500;

export class ListGoalkeepersQueryHandler implements IQueryHandler<ListGoalkeepersQuery, ListGoalkeepersResult> {
  constructor(private readonly deps: GoalkeepersAdminDependencies) {}

  async handle({ criteria }: ListGoalkeepersQuery): Promise<ListGoalkeepersResult> {
    let userIds: string[] | undefined;
    if (criteria.q && criteria.q.trim().length >= 2) {
      userIds = await this.deps.userReader.findIds(criteria.q, MAX_SEARCHED_USERS + 1);
      if (userIds.length > MAX_SEARCHED_USERS) return { outcome: 'search_too_broad' };
    }
    const { items, totalItems } = await this.deps.reader.list({
      userIds,
      cityId: criteria.cityId,
      zoneId: criteria.zoneId,
      suspended: criteria.suspended,
      availableForOffers: criteria.availableForOffers,
      balanceBelow: criteria.balanceBelow,
      vetting: criteria.vetting,
      verificationMethod: criteria.verificationMethod,
      backgroundCheck: criteria.backgroundCheck,
      now: this.deps.clock.now(),
      page: criteria.page,
      pageSize: criteria.pageSize,
    });
    const ids = items.map((item) => item.userId);
    const cityIds = [...new Set(items.flatMap((item) => (item.cityId ? [item.cityId] : [])))];
    const [users, cities, ratings, blocks] = await Promise.all([
      this.deps.users.getByIds(ids),
      this.deps.cities.getByIds(cityIds),
      this.deps.reader.ratingsFor(ids),
      this.deps.blocks.findByUserIds(ids),
    ]);
    const usersById = new Map(users.map((user) => [user.id, user]));
    const citiesById = new Map(cities.map((city) => [city.id, city]));
    const rows = items.map((item) => {
      const user = usersById.get(item.userId);
      const city = item.cityId ? citiesById.get(item.cityId) : undefined;
      return {
        userId: item.userId,
        name: user ? userName(user) : null,
        city: city ? { id: city.id, name: city.name } : null,
        zoneCount: item.zoneCount,
        availableForOffers: item.availableForOffers,
        suspendedUntil: item.suspendedUntil?.toISOString() ?? null,
        balance: item.balance,
        currency: item.currency,
        rating: ratings.get(item.userId) ?? null,
        blocked: blocks.get(item.userId)?.blocked ?? false,
        vetting: item.vetting ?? { tier: 'unvalidated' as const, verificationMethod: null, backgroundCheckAlert: null },
      };
    });
    return { outcome: 'ok', page: pageOf(rows, criteria.page, criteria.pageSize, totalItems) };
  }
}
