import { IQuery } from '../../../../common/mediator/types.js';
import type { DepositResponse } from '../../common/depositResponses.js';

export type ListDepositsResult =
  | { outcome: 'success'; items: DepositResponse[]; page: number; pageSize: number; totalItems: number; totalPages: number }
  | { outcome: 'not_a_goalkeeper' };

/** The goalkeeper's own deposits, newest first (contracts §3). */
export class ListDepositsQuery extends IQuery<ListDepositsResult> {
  constructor(
    public readonly goalkeeperId: string,
    public readonly page: number,
    public readonly pageSize: number,
  ) {
    super();
  }
}
