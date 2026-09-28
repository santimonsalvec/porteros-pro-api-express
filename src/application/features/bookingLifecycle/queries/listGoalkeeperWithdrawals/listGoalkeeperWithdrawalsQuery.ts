import { IQuery } from '../../../../common/mediator/types.js';
import type { WithdrawalItem, WithdrawalView } from '../../common/withdrawalResponses.js';

export type ListGoalkeeperWithdrawalsResult =
  | {
      outcome: 'ok';
      items: WithdrawalItem[];
      page: number;
      pageSize: number;
      totalItems: number;
      totalPages: number;
      /** The goalkeeper's current suspension end, when suspended now. */
      suspendedUntil: string | null;
    }
  | { outcome: 'not_a_goalkeeper' };

/** A goalkeeper's withdrawals and penalties, newest first (feature 018): their own, or any for an admin. */
export class ListGoalkeeperWithdrawalsQuery extends IQuery<ListGoalkeeperWithdrawalsResult> {
  constructor(
    readonly goalkeeperId: string,
    readonly page: number,
    readonly pageSize: number,
    readonly view: WithdrawalView,
  ) {
    super();
  }
}
