import { IQuery } from '../../../../common/mediator/types.js';
import type { GoalkeeperVettingView } from '../../common/vettingViews.js';

export type GetGoalkeeperVettingResult = { outcome: 'ok'; vetting: GoalkeeperVettingView } | { outcome: 'not_a_goalkeeper' };

/** Everything the admin's "Validación" tab shows, in one read (contracts C2). */
export class GetGoalkeeperVettingQuery extends IQuery<GetGoalkeeperVettingResult> {
  constructor(public readonly goalkeeperId: string) {
    super();
  }
}
