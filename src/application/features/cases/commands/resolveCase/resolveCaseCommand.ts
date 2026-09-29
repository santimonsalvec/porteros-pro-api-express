import { ICommand } from '../../../../common/mediator/types.js';
import type { CaseDetail } from '../../common/caseResponses.js';

export type ResolveCaseResult =
  | { outcome: 'resolved'; case: CaseDetail }
  | { outcome: 'case_not_found' }
  | { outcome: 'case_already_resolved' }
  | { outcome: 'invalid_note'; message: string };

/** An administrator closes a case with a mandatory note (feature 021). */
export class ResolveCaseCommand extends ICommand<ResolveCaseResult> {
  constructor(
    readonly adminId: string,
    readonly caseId: string,
    readonly note: string,
  ) {
    super();
  }
}
