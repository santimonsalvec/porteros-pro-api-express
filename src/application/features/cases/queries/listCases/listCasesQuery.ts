import { IQuery } from '../../../../common/mediator/types.js';
import type { CaseStatus } from '../../../../../domain/cases/case.js';
import type { CaseItem } from '../../common/caseResponses.js';

export type ListCasesResult = { outcome: 'ok'; items: CaseItem[]; page: number; pageSize: number; totalItems: number; totalPages: number };

/** The cases for manual review, open first (feature 021, administrators). */
export class ListCasesQuery extends IQuery<ListCasesResult> {
  constructor(
    readonly status: CaseStatus | null,
    readonly page: number,
    readonly pageSize: number,
  ) {
    super();
  }
}
