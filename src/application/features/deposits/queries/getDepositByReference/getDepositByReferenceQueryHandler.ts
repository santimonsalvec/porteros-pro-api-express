import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { IDepositRepository } from '../../../payments/common/ports.js';
import { GetDepositByReferenceQuery, type GetDepositByReferenceResult } from './getDepositByReferenceQuery.js';

export class GetDepositByReferenceQueryHandler implements IQueryHandler<GetDepositByReferenceQuery, GetDepositByReferenceResult> {
  constructor(private readonly depositRepository: IDepositRepository) {}

  async handle(query: GetDepositByReferenceQuery): Promise<GetDepositByReferenceResult> {
    const deposit = await this.depositRepository.getByReference(query.reference);
    if (!deposit) return { outcome: 'not_found' };
    return { outcome: 'success', deposit: { status: deposit.status, amount: deposit.amount, net: deposit.net, currency: deposit.currency } };
  }
}
