import { IQuery } from '../../../../common/mediator/types.js';
import type { Page } from '../../../geography/common/views.js';
import type { PersonRef } from '../../../goalkeeperRequests/common/adminViews.js';
import type { OperatingBalanceAdminFilter } from '../../common/adminPorts.js';

/** A row of Finanzas → Saldos operativos (admin spec 007, contracts/finance-api.md §1). */
export interface OperatingBalanceRow {
  goalkeeper: PersonRef;
  marketName: string | null;
  countryId: string | null;
  countryName: string | null;
  balance: number;
  currency: string;
  lastMovementAt: string;
}

export interface ListOperatingBalancesAdminResult {
  outcome: 'ok';
  page: Page<OperatingBalanceRow>;
}

export class ListOperatingBalancesAdminQuery extends IQuery<ListOperatingBalancesAdminResult> {
  constructor(public readonly criteria: OperatingBalanceAdminFilter & { page: number; pageSize: number }) {
    super();
  }
}
