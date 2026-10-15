import { IQuery } from '../../../../common/mediator/types.js';
import type { Page } from '../../../geography/common/views.js';
import type { DepositAdminFilter } from '../../../payments/common/adminPorts.js';
import type { DepositRow } from '../../common/depositAdminViews.js';

export interface ListDepositsAdminResult {
  outcome: 'ok';
  page: Page<DepositRow>;
}

/** The admin's deposit list (admin spec 007, FR-003), newest first. */
export class ListDepositsAdminQuery extends IQuery<ListDepositsAdminResult> {
  constructor(public readonly criteria: DepositAdminFilter & { page: number; pageSize: number }) {
    super();
  }
}
