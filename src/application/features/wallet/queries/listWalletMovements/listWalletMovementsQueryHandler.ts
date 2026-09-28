import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { IGoalkeeperProfileRepository } from '../../../goalkeepers/common/ports.js';
import type { IWalletMovementRepository, IWalletRepository } from '../../common/ports.js';
import { toAdminMovementItem, toMovementItem } from '../../common/walletResponses.js';
import { ListWalletMovementsQuery, type ListWalletMovementsResult } from './listWalletMovementsQuery.js';

/**
 * Movements newest first by sequence. The total is the wallet's `lastSequence` — each movement
 * increments it exactly once — so no count query is needed (research.md §9).
 */
export class ListWalletMovementsQueryHandler implements IQueryHandler<ListWalletMovementsQuery, ListWalletMovementsResult> {
  constructor(
    private readonly goalkeeperProfileRepository: IGoalkeeperProfileRepository,
    private readonly walletRepository: IWalletRepository,
    private readonly movementRepository: IWalletMovementRepository,
  ) {}

  async handle(query: ListWalletMovementsQuery): Promise<ListWalletMovementsResult> {
    const { goalkeeperId, page, pageSize, audience } = query;
    if (!(await this.goalkeeperProfileRepository.getByUserId(goalkeeperId))) return { outcome: 'not_a_goalkeeper' };

    const wallet = await this.walletRepository.findByGoalkeeperId(goalkeeperId);
    const totalItems = wallet?.lastSequence ?? 0;
    const movements = totalItems === 0 ? [] : await this.movementRepository.listForWallet(goalkeeperId, (page - 1) * pageSize, pageSize);

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
