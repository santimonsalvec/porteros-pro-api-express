import { IQuery } from '../../../../common/mediator/types.js';
import type { DepositDetail } from '../../common/depositAdminViews.js';

export type GetDepositAdminResult = { outcome: 'ok'; deposit: DepositDetail } | { outcome: 'not_found' };

/** One deposit with its checks, for the admin (admin spec 007, FR-004). */
export class GetDepositAdminQuery extends IQuery<GetDepositAdminResult> {
  constructor(public readonly depositId: string) {
    super();
  }
}
