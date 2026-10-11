import { IQuery } from '../../../../common/mediator/types.js';
import type { StaffRoleView } from '../../common/staffViews.js';

export type GetStaffRoleResult = { outcome: 'ok'; role: StaffRoleView } | { outcome: 'role_not_found' };

export class GetStaffRoleQuery extends IQuery<GetStaffRoleResult> {
  constructor(readonly roleId: string) {
    super();
  }
}
