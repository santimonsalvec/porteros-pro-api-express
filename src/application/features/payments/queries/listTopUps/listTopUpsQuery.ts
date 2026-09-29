import { IQuery } from '../../../../common/mediator/types.js';
import type { TopUpResponse } from '../../common/topUpResponses.js';

export type ListTopUpsResult =
  | { outcome: 'success'; items: TopUpResponse[]; page: number; pageSize: number; totalItems: number; totalPages: number }
  | { outcome: 'not_a_goalkeeper' };

/** The goalkeeper's own top-ups, newest first (contracts §3). */
export class ListTopUpsQuery extends IQuery<ListTopUpsResult> {
  constructor(
    public readonly goalkeeperId: string,
    public readonly page: number,
    public readonly pageSize: number,
  ) {
    super();
  }
}
