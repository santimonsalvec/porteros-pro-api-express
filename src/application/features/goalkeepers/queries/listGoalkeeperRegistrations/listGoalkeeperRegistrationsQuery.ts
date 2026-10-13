import { IQuery } from '../../../../common/mediator/types.js';
import type { Page } from '../../../geography/common/views.js';
import type { RegistrationRow, RegistrationStep, RegistrationSummary } from '../../common/adminViews.js';

export interface ListRegistrationsCriteria {
  step?: RegistrationStep;
  cityId?: string;
  /** Only those without activity for at least this many days. */
  idleDaysMin?: number;
  page: number;
  pageSize: number;
}

/** A page, and how many are stuck on each step (without the step filter). */
export type ListGoalkeeperRegistrationsResult = Page<RegistrationRow> & { summary: RegistrationSummary };

/** The goalkeeper registrations still in progress (contracts/users-goalkeepers-api.md §4). */
export class ListGoalkeeperRegistrationsQuery extends IQuery<ListGoalkeeperRegistrationsResult> {
  constructor(readonly criteria: ListRegistrationsCriteria) {
    super();
  }
}
