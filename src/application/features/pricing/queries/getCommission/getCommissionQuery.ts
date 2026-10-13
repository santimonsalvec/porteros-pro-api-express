import { IQuery } from '../../../../common/mediator/types.js';
import type { CommissionView } from '../../common/views.js';

export type GetCommissionResult = { outcome: 'ok'; commission: CommissionView } | { outcome: 'not_found' };

export class GetCommissionQuery extends IQuery<GetCommissionResult> {
  constructor(readonly commissionId: string) {
    super();
  }
}
