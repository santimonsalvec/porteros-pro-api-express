import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { IGoalkeeperProfileRepository } from '../../../goalkeepers/common/ports.js';
import type { IBalanceMovementRepository, IOperatingBalanceRepository } from '../../common/ports.js';
import { toAdminMovementItem, toMovementItem } from '../../common/operatingBalanceResponses.js';
import { ListBalanceMovementsQuery, type ListBalanceMovementsResult } from './listBalanceMovementsQuery.js';

/**
 * Movements newest first by sequence. The total is the operating balance's `lastSequence` — each movement
 * increments it exactly once — so no count query is needed (research.md §9).
 */
export class ListBalanceMovementsQueryHandler implements IQueryHandler<ListBalanceMovementsQuery, ListBalanceMovementsResult> {
  constructor(
    private readonly goalkeeperProfileRepository: IGoalkeeperProfileRepository,
    private readonly operatingBalanceRepository: IOperatingBalanceRepository,
    private readonly movementRepository: IBalanceMovementRepository,
  ) {}

  async handle(query: ListBalanceMovementsQuery): Promise<ListBalanceMovementsResult> {
    const { goalkeeperId, page, pageSize, audience } = query;
    if (!(await this.goalkeeperProfileRepository.getByUserId(goalkeeperId))) return { outcome: 'not_a_goalkeeper' };

    const operatingBalance = await this.operatingBalanceRepository.findByGoalkeeperId(goalkeeperId);
    const totalItems = operatingBalance?.lastSequence ?? 0;
    const movements = totalItems === 0 ? [] : await this.movementRepository.listForOperatingBalance(goalkeeperId, (page - 1) * pageSize, pageSize);

    return {
      outcome: 'success',
      items: movements.map(audience === 'admin' ? toAdminMovementItem : toMovementItem),
      page,
      pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / pageSize),
    };
  }
}
