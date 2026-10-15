import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { IUserRepository } from '../../../auth/common/ports.js';
import type { ICityRepository } from '../../../locations/common/ports.js';
import type { IUserAdminReader, IUserBlockRepository } from '../../../users/common/ports.js';
import { userName } from '../../../users/common/userViewing.js';
import type { IGoalkeeperProfileRepository } from '../../common/ports.js';
import { ListReferrerOptionsQuery, type ReferrerOption } from './listReferrerOptionsQuery.js';

/** How many options the picker shows, and how many users the name search reads to find them. */
const OPTIONS = 20;
const SEARCHED = 100;

export interface ListReferrerOptionsDependencies {
  userReader: Pick<IUserAdminReader, 'findIds'>;
  profiles: Pick<IGoalkeeperProfileRepository, 'getByUserId'>;
  users: Pick<IUserRepository, 'getByIds'>;
  blocks: Pick<IUserBlockRepository, 'findByUserIds'>;
  cities: Pick<ICityRepository, 'getByIds'>;
}

export class ListReferrerOptionsQueryHandler implements IQueryHandler<ListReferrerOptionsQuery, { items: ReferrerOption[] }> {
  constructor(private readonly deps: ListReferrerOptionsDependencies) {}

  async handle(query: ListReferrerOptionsQuery): Promise<{ items: ReferrerOption[] }> {
    if (query.q.trim().length < 2) return { items: [] };
    const ids = (await this.deps.userReader.findIds(query.q.trim(), SEARCHED)).filter((id) => id !== query.exclude);
    const [profiles, blocks] = await Promise.all([Promise.all(ids.map((id) => this.deps.profiles.getByUserId(id))), this.deps.blocks.findByUserIds(ids)]);
    const eligible = profiles
      .flatMap((profile) => (profile && profile.tier !== 'unvalidated' && !blocks.get(profile.userId)?.blocked ? [profile] : []))
      .slice(0, OPTIONS);
    const [users, cities] = await Promise.all([
      this.deps.users.getByIds(eligible.map((profile) => profile.userId)),
      this.deps.cities.getByIds([...new Set(eligible.map((profile) => profile.cityId))]),
    ]);
    const usersById = new Map(users.map((user) => [user.id, user]));
    const citiesById = new Map(cities.map((city) => [city.id, city]));
    return {
      items: eligible.map((profile) => {
        const user = usersById.get(profile.userId);
        const city = citiesById.get(profile.cityId);
        return { userId: profile.userId, name: user ? userName(user) : null, city: city ? { id: city.id, name: city.name } : null };
      }),
    };
  }
}
