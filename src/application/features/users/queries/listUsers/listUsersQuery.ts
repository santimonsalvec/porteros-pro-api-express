import { IQuery } from '../../../../common/mediator/types.js';
import type { Page } from '../../../geography/common/views.js';
import type { UserRow } from '../../common/views.js';

export interface ListUsersCriteria {
  q?: string;
  role?: 'client' | 'goalkeeper';
  /** ISO code of the country. */
  countryCode?: string;
  /** `YYYY-MM-DD`, a whole day in Colombia, included. */
  createdFrom?: string;
  /** `YYYY-MM-DD`, a whole day in Colombia, included. */
  createdTo?: string;
  blocked?: boolean;
  page: number;
  pageSize: number;
}

export type ListUsersResult = Page<UserRow>;

/** The admin's user list (contracts/users-goalkeepers-api.md §1). */
export class ListUsersQuery extends IQuery<ListUsersResult> {
  constructor(readonly criteria: ListUsersCriteria) {
    super();
  }
}
