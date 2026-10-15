import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { IGoalkeeperProfileRepository } from '../../../goalkeepers/common/ports.js';
import type { IDepositRepository } from '../../../payments/common/ports.js';
import { toDepositResponse } from '../../common/depositResponses.js';
import { ListDepositsQuery, type ListDepositsResult } from './listDepositsQuery.js';

export class ListDepositsQueryHandler implements IQueryHandler<ListDepositsQuery, ListDepositsResult> {
  constructor(
    private readonly goalkeeperProfileRepository: IGoalkeeperProfileRepository,
    private readonly depositRepository: IDepositRepository,
  ) {}

  async handle(query: ListDepositsQuery): Promise<ListDepositsResult> {
    const { goalkeeperId, page, pageSize } = query;
    if (!(await this.goalkeeperProfileRepository.getByUserId(goalkeeperId))) return { outcome: 'not_a_goalkeeper' };

    const [deposits, totalItems] = await Promise.all([
      this.depositRepository.listForGoalkeeper(goalkeeperId, (page - 1) * pageSize, pageSize),
      this.depositRepository.countForGoalkeeper(goalkeeperId),
    ]);
    return {
      outcome: 'success',
      items: deposits.map(toDepositResponse),
      page,
      pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / pageSize),
    };
  }
}
