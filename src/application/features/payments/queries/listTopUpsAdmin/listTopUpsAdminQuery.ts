import { IQuery } from '../../../../common/mediator/types.js';
import type { Page } from '../../../geography/common/views.js';
import type { TopUpAdminFilter } from '../../common/adminPorts.js';
import type { TopUpRow } from '../../common/topUpAdminViews.js';

export interface ListTopUpsAdminResult {
  outcome: 'ok';
  page: Page<TopUpRow>;
}

/** The admin's top-up list (admin spec 007, FR-003), newest first. */
export class ListTopUpsAdminQuery extends IQuery<ListTopUpsAdminResult> {
  constructor(public readonly criteria: TopUpAdminFilter & { page: number; pageSize: number }) {
    super();
  }
}
