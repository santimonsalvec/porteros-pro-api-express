import { IQuery } from '../../../../common/mediator/types.js';
import type { CaseStatus, CaseType } from '../../../../../domain/cases/case.js';
import type { Page } from '../../../geography/common/views.js';
import type { CaseAdminItem } from '../../common/caseAdminViews.js';

export interface ListCasesAdminCriteria {
  status?: CaseStatus;
  countryId?: string;
  /** Spec 031: one market, from X-Scope; wins over the country. */
  marketId?: string;
  /** Spec 031: the markets a member who holds only some may see. */
  marketIds?: readonly string[];
  type?: CaseType;
  from?: Date;
  to?: Date;
  order?: 'default' | 'oldest';
  page: number;
  pageSize: number;
}

export type ListCasesAdminResult = { outcome: 'ok'; page: Page<CaseAdminItem> };

/** The admin's case list (contracts/operations-api.md §6). */
export class ListCasesAdminQuery extends IQuery<ListCasesAdminResult> {
  constructor(readonly criteria: ListCasesAdminCriteria) {
    super();
  }
}
