import { IQuery } from '../../../../common/mediator/types.js';
import type { GoalkeeperDetail } from '../../common/adminViews.js';

export type GetGoalkeeperAdminResult = { outcome: 'ok'; goalkeeper: GoalkeeperDetail } | { outcome: 'not_a_goalkeeper' };

/** A goalkeeper's detail for the admin, without the document number (contracts §3). */
export class GetGoalkeeperAdminQuery extends IQuery<GetGoalkeeperAdminResult> {
  constructor(readonly userId: string) {
    super();
  }
}
