import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { ITopUpRepository } from '../../common/ports.js';
import { GetTopUpByReferenceQuery, type GetTopUpByReferenceResult } from './getTopUpByReferenceQuery.js';

export class GetTopUpByReferenceQueryHandler implements IQueryHandler<GetTopUpByReferenceQuery, GetTopUpByReferenceResult> {
  constructor(private readonly topUpRepository: ITopUpRepository) {}

  async handle(query: GetTopUpByReferenceQuery): Promise<GetTopUpByReferenceResult> {
    const topUp = await this.topUpRepository.getByReference(query.reference);
    if (!topUp) return { outcome: 'not_found' };
    return { outcome: 'success', topUp: { status: topUp.status, amount: topUp.amount, net: topUp.net, currency: topUp.currency } };
  }
}
