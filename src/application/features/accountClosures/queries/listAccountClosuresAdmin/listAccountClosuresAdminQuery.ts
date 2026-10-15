import { IQuery } from '../../../../common/mediator/types.js';
import type { ClosureStatus } from '../../../../../domain/accountClosures/accountClosure.js';
import type { Page } from '../../../geography/common/views.js';
import type { ClosureListItem } from '../../common/adminClosureViews.js';

export interface ClosureListFilters {
  statuses: readonly ClosureStatus[];
  /** Name or email, as the user search takes it. */
  q: string | null;
  debt: 'with' | 'without' | null;
  page: number;
  pageSize: number;
}

export type ListAccountClosuresAdminResult = { outcome: 'ok'; page: Page<ClosureListItem> };

/** The administrators' list of closure requests (feature 029). */
export class ListAccountClosuresAdminQuery extends IQuery<ListAccountClosuresAdminResult> {
  constructor(readonly filters: ClosureListFilters) {
    super();
  }
}
