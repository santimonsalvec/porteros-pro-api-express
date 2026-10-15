import { IQuery } from '../../../../common/mediator/types.js';
import type { ClosureDetail } from '../../common/adminClosureViews.js';

export type GetAccountClosureAdminResult = { outcome: 'ok'; detail: ClosureDetail } | { outcome: 'not_found' };

export class GetAccountClosureAdminQuery extends IQuery<GetAccountClosureAdminResult> {
  constructor(readonly closureId: string) {
    super();
  }
}
