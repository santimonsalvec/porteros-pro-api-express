import { IQuery } from '../../../../common/mediator/types.js';
import type { DepositResponse } from '../../common/depositResponses.js';

export type GetDepositResult = { outcome: 'success'; deposit: DepositResponse } | { outcome: 'not_found' };

/** One of the goalkeeper's own deposits; another goalkeeper's is indistinguishable from none. */
export class GetDepositQuery extends IQuery<GetDepositResult> {
  constructor(
    public readonly goalkeeperId: string,
    public readonly depositId: string,
  ) {
    super();
  }
}
