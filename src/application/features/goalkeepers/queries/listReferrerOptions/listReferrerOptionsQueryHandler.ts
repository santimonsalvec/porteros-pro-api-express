import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { IUserRepository } from '../../../auth/common/ports.js';
import type { IMarketRepository } from '../../../markets/common/ports.js';
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
  markets: Pick<IMarketRepository, 'getByIds'>;
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
    const [users, markets] = await Promise.all([
      this.deps.users.getByIds(eligible.map((profile) => profile.userId)),
      this.deps.markets.getByIds([...new Set(eligible.map((profile) => profile.marketId))]),
    ]);
    const usersById = new Map(users.map((user) => [user.id, user]));
    const citiesById = new Map(markets.map((market) => [market.id, market]));
    return {
      items: eligible.map((profile) => {
        const user = usersById.get(profile.userId);
        const market = citiesById.get(profile.marketId);
        return { userId: profile.userId, name: user ? userName(user) : null, market: market ? { id: market.id, name: market.name } : null };
      }),
    };
  }
}
