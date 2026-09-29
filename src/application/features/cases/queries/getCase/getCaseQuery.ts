import { IQuery } from '../../../../common/mediator/types.js';
import type { CaseDetail } from '../../common/caseResponses.js';

export type GetCaseResult = { outcome: 'ok'; case: CaseDetail } | { outcome: 'case_not_found' };

/** One case with the rating that opened it and the check-in evidence (feature 021, administrators). */
export class GetCaseQuery extends IQuery<GetCaseResult> {
  constructor(readonly caseId: string) {
    super();
  }
}
