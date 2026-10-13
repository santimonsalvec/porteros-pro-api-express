import { IQuery } from '../../../../common/mediator/types.js';
import type { CaseAdminDetail } from '../../common/caseAdminViews.js';

export type GetCaseAdminResult = { outcome: 'ok'; case: CaseAdminDetail } | { outcome: 'case_not_found' };

/** One case with its evidence, for the admin (contracts/operations-api.md §7): the photo is a read of its own. */
export class GetCaseAdminQuery extends IQuery<GetCaseAdminResult> {
  constructor(readonly caseId: string) {
    super();
  }
}
