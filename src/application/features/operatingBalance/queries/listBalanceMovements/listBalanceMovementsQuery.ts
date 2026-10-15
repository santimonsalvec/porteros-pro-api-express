import { IQuery } from '../../../../common/mediator/types.js';
import type { AdminMovementItemResponse, MovementItemResponse } from '../../common/operatingBalanceResponses.js';

export type OperatingBalanceAudience = 'goalkeeper' | 'admin';

export type ListBalanceMovementsResult =
  | {
      outcome: 'success';
      items: (MovementItemResponse | AdminMovementItemResponse)[];
      page: number;
      pageSize: number;
      totalItems: number;
      totalPages: number;
    }
  | { outcome: 'not_a_goalkeeper' };

/** A operating balance's movements, newest first, one page at a time. Admins also see actor, cause and invoicing. */
export class ListBalanceMovementsQuery extends IQuery<ListBalanceMovementsResult> {
  constructor(
    public readonly goalkeeperId: string,
    public readonly page: number,
    public readonly pageSize: number,
    public readonly audience: OperatingBalanceAudience,
  ) {
    super();
  }
}
