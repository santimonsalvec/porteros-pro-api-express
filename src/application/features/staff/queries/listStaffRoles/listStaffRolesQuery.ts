import { IQuery } from '../../../../common/mediator/types.js';
import type { StaffRoleView } from '../../common/staffViews.js';

export interface ListStaffRolesResult {
  items: StaffRoleView[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

/** The roles with how many members each has (spec 002, US3). */
export class ListStaffRolesQuery extends IQuery<ListStaffRolesResult> {
  constructor(
    readonly page: number,
    readonly pageSize: number,
  ) {
    super();
  }
}
