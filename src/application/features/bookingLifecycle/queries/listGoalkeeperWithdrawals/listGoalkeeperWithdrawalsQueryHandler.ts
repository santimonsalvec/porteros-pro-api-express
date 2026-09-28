import type { IClock } from '../../../../common/clock.js';
import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { IGoalkeeperProfileRepository } from '../../../goalkeepers/common/ports.js';
import type { IGoalkeeperIncidentRepository } from '../../common/ports.js';
import { toWithdrawalItem } from '../../common/withdrawalResponses.js';
import { ListGoalkeeperWithdrawalsQuery, type ListGoalkeeperWithdrawalsResult } from './listGoalkeeperWithdrawalsQuery.js';

export interface ListGoalkeeperWithdrawalsDependencies {
  goalkeeperProfileRepository: IGoalkeeperProfileRepository;
  incidents: IGoalkeeperIncidentRepository;
  clock: IClock;
}

/** The history behind "why can't I see matches?" (FR-015–FR-017), one page at a time. */
export class ListGoalkeeperWithdrawalsQueryHandler implements IQueryHandler<ListGoalkeeperWithdrawalsQuery, ListGoalkeeperWithdrawalsResult> {
  constructor(private readonly deps: ListGoalkeeperWithdrawalsDependencies) {}

  async handle(query: ListGoalkeeperWithdrawalsQuery): Promise<ListGoalkeeperWithdrawalsResult> {
    const { goalkeeperId, page, pageSize, view } = query;
    const profile = await this.deps.goalkeeperProfileRepository.getByUserId(goalkeeperId);
    if (!profile) return { outcome: 'not_a_goalkeeper' };

    const [incidents, totalItems] = await Promise.all([
      this.deps.incidents.listForGoalkeeper(goalkeeperId, (page - 1) * pageSize, pageSize),
      this.deps.incidents.countForGoalkeeper(goalkeeperId),
    ]);
    const suspended = profile.suspendedUntil && profile.suspendedUntil > this.deps.clock.now() ? profile.suspendedUntil : null;
    return {
      outcome: 'ok',
      items: incidents.map((incident) => toWithdrawalItem(incident, view)),
      page,
      pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / pageSize),
      suspendedUntil: suspended?.toISOString() ?? null,
    };
  }
}
