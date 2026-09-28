import { IQuery } from '../../../../common/mediator/types.js';
import type { AdminMovementItemResponse, MovementItemResponse } from '../../common/walletResponses.js';

export type WalletAudience = 'goalkeeper' | 'admin';

export type ListWalletMovementsResult =
  | {
      outcome: 'success';
      items: (MovementItemResponse | AdminMovementItemResponse)[];
      page: number;
      pageSize: number;
      totalItems: number;
      totalPages: number;
    }
  | { outcome: 'not_a_goalkeeper' };

/** A wallet's movements, newest first, one page at a time. Admins also see actor, cause and invoicing. */
export class ListWalletMovementsQuery extends IQuery<ListWalletMovementsResult> {
  constructor(
    public readonly goalkeeperId: string,
    public readonly page: number,
    public readonly pageSize: number,
    public readonly audience: WalletAudience,
  ) {
    super();
  }
}
