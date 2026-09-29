import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { IGoalkeeperProfileRepository } from '../../../goalkeepers/common/ports.js';
import type { ITopUpRepository } from '../../common/ports.js';
import { toTopUpResponse } from '../../common/topUpResponses.js';
import { ListTopUpsQuery, type ListTopUpsResult } from './listTopUpsQuery.js';

export class ListTopUpsQueryHandler implements IQueryHandler<ListTopUpsQuery, ListTopUpsResult> {
  constructor(
    private readonly goalkeeperProfileRepository: IGoalkeeperProfileRepository,
    private readonly topUpRepository: ITopUpRepository,
  ) {}

  async handle(query: ListTopUpsQuery): Promise<ListTopUpsResult> {
    const { goalkeeperId, page, pageSize } = query;
    if (!(await this.goalkeeperProfileRepository.getByUserId(goalkeeperId))) return { outcome: 'not_a_goalkeeper' };

    const [topUps, totalItems] = await Promise.all([
      this.topUpRepository.listForGoalkeeper(goalkeeperId, (page - 1) * pageSize, pageSize),
      this.topUpRepository.countForGoalkeeper(goalkeeperId),
    ]);
    return {
      outcome: 'success',
      items: topUps.map(toTopUpResponse),
      page,
      pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / pageSize),
    };
  }
}
