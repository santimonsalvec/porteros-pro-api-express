import { IQuery } from '../../../../common/mediator/types.js';
import type { StaffStatus } from '../../../../../domain/staff/staffMember.js';
import type { StaffMemberView } from '../../common/staffViews.js';

export interface StaffMemberFilters {
  status?: StaffStatus;
  roleId?: string;
  q?: string;
}

export interface ListStaffMembersResult {
  items: StaffMemberView[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

/** The team, one page at a time (spec 002, US1). */
export class ListStaffMembersQuery extends IQuery<ListStaffMembersResult> {
  constructor(
    readonly filters: StaffMemberFilters,
    readonly page: number,
    readonly pageSize: number,
  ) {
    super();
  }
}
