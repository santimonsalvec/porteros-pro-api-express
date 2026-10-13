import { IQuery } from '../../../../common/mediator/types.js';
import type { Page } from '../../../geography/common/views.js';
import type { PersonRef } from '../../../goalkeeperRequests/common/adminViews.js';
import type { WalletAdminFilter } from '../../common/adminPorts.js';

/** A row of Finanzas → Billeteras (admin spec 007, contracts/finance-api.md §1). */
export interface WalletRow {
  goalkeeper: PersonRef;
  cityName: string | null;
  countryId: string | null;
  countryName: string | null;
  balance: number;
  currency: string;
  lastMovementAt: string;
}

export interface ListWalletsAdminResult {
  outcome: 'ok';
  page: Page<WalletRow>;
}

export class ListWalletsAdminQuery extends IQuery<ListWalletsAdminResult> {
  constructor(public readonly criteria: WalletAdminFilter & { page: number; pageSize: number }) {
    super();
  }
}
