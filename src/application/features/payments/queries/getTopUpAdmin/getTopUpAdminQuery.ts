import { IQuery } from '../../../../common/mediator/types.js';
import type { TopUpDetail } from '../../common/topUpAdminViews.js';

export type GetTopUpAdminResult = { outcome: 'ok'; topUp: TopUpDetail } | { outcome: 'not_found' };

/** One top-up with its checks, for the admin (admin spec 007, FR-004). */
export class GetTopUpAdminQuery extends IQuery<GetTopUpAdminResult> {
  constructor(public readonly topUpId: string) {
    super();
  }
}
