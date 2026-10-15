import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { IDepositRepository } from '../../../payments/common/ports.js';
import { toDepositResponse } from '../../common/depositResponses.js';
import { GetDepositQuery, type GetDepositResult } from './getDepositQuery.js';

export class GetDepositQueryHandler implements IQueryHandler<GetDepositQuery, GetDepositResult> {
  constructor(private readonly depositRepository: IDepositRepository) {}

  async handle(query: GetDepositQuery): Promise<GetDepositResult> {
    const deposit = await this.depositRepository.getById(query.depositId);
    if (!deposit || deposit.goalkeeperId !== query.goalkeeperId) return { outcome: 'not_found' };
    return { outcome: 'success', deposit: toDepositResponse(deposit) };
  }
}
