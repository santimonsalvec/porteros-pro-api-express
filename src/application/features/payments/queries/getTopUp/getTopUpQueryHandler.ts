import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { ITopUpRepository } from '../../common/ports.js';
import { toTopUpResponse } from '../../common/topUpResponses.js';
import { GetTopUpQuery, type GetTopUpResult } from './getTopUpQuery.js';

export class GetTopUpQueryHandler implements IQueryHandler<GetTopUpQuery, GetTopUpResult> {
  constructor(private readonly topUpRepository: ITopUpRepository) {}

  async handle(query: GetTopUpQuery): Promise<GetTopUpResult> {
    const topUp = await this.topUpRepository.getById(query.topUpId);
    if (!topUp || topUp.goalkeeperId !== query.goalkeeperId) return { outcome: 'not_found' };
    return { outcome: 'success', topUp: toTopUpResponse(topUp) };
  }
}
