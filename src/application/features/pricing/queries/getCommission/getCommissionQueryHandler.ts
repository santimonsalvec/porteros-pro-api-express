import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { ICommissionAdmin } from '../../common/ports.js';
import { commissionViews, type CommissionViewDependencies } from '../listCommissions/commissionViews.js';
import { GetCommissionQuery, type GetCommissionResult } from './getCommissionQuery.js';

export class GetCommissionQueryHandler implements IQueryHandler<GetCommissionQuery, GetCommissionResult> {
  constructor(private readonly deps: CommissionViewDependencies & { commissions: ICommissionAdmin }) {}

  async handle({ commissionId }: GetCommissionQuery): Promise<GetCommissionResult> {
    const record = await this.deps.commissions.getById(commissionId);
    if (!record) return { outcome: 'not_found' };
    const { views } = await commissionViews(this.deps, [record]);
    return { outcome: 'ok', commission: views[0]! };
  }
}
