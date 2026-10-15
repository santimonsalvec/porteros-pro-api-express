import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { IAccountClosureRepository } from '../../common/ports.js';
import { GetClosureGateQuery, type ClosureGate } from './getClosureGateQuery.js';

export class GetClosureGateQueryHandler implements IQueryHandler<GetClosureGateQuery, ClosureGate> {
  constructor(private readonly closures: Pick<IAccountClosureRepository, 'findOpenByUserId'>) {}

  async handle({ userId }: GetClosureGateQuery): Promise<ClosureGate> {
    const open = await this.closures.findOpenByUserId(userId);
    return { closing: open !== null, debtDepositAllowed: open?.debtResolution === 'deposit_required' };
  }
}
