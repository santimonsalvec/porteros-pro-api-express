import { IQuery } from '../../../../common/mediator/types.js';
import type { VerificationMethod, VettingTier } from '../../../../../domain/goalkeepers/vetting.js';
import type { BackgroundCheckAlert } from '../../common/adminPorts.js';
import type { Page } from '../../../geography/common/views.js';
import type { GoalkeeperRow } from '../../common/adminViews.js';

export interface ListGoalkeepersCriteria {
  q?: string;
  cityId?: string;
  zoneId?: string;
  suspended?: boolean;
  availableForOffers?: boolean;
  balanceBelow?: number;
  /** Admin spec 030. */
  vetting?: VettingTier;
  verificationMethod?: VerificationMethod;
  backgroundCheck?: BackgroundCheckAlert;
  page: number;
  pageSize: number;
}

export type ListGoalkeepersResult = { outcome: 'ok'; page: Page<GoalkeeperRow> } | { outcome: 'search_too_broad' };

/** The admin's goalkeeper list (contracts/users-goalkeepers-api.md §3). */
export class ListGoalkeepersQuery extends IQuery<ListGoalkeepersResult> {
  constructor(readonly criteria: ListGoalkeepersCriteria) {
    super();
  }
}
