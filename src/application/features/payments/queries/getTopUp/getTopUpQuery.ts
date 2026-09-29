import { IQuery } from '../../../../common/mediator/types.js';
import type { TopUpResponse } from '../../common/topUpResponses.js';

export type GetTopUpResult = { outcome: 'success'; topUp: TopUpResponse } | { outcome: 'not_found' };

/** One of the goalkeeper's own top-ups; another goalkeeper's is indistinguishable from none. */
export class GetTopUpQuery extends IQuery<GetTopUpResult> {
  constructor(
    public readonly goalkeeperId: string,
    public readonly topUpId: string,
  ) {
    super();
  }
}
