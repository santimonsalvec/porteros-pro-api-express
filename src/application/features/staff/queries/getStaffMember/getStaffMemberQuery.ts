import { IQuery } from '../../../../common/mediator/types.js';
import type { StaffMemberView } from '../../common/staffViews.js';

export type GetStaffMemberResult = { outcome: 'ok'; member: StaffMemberView } | { outcome: 'staff_not_found' };

export class GetStaffMemberQuery extends IQuery<GetStaffMemberResult> {
  constructor(readonly staffId: string) {
    super();
  }
}
