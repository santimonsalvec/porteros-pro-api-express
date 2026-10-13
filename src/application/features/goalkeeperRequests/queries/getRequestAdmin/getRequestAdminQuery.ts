import { IQuery } from '../../../../common/mediator/types.js';
import type { RequestDetail } from '../../common/adminViews.js';

export type GetRequestAdminResult = { outcome: 'ok'; request: RequestDetail } | { outcome: 'request_not_found' };

/** One request with every fact of its timeline (contracts/operations-api.md §2). */
export class GetRequestAdminQuery extends IQuery<GetRequestAdminResult> {
  constructor(readonly requestId: string) {
    super();
  }
}
