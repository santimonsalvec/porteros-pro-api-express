import { ICommand } from '../../../../common/mediator/types.js';
import type { StaffRoleView } from '../../common/staffViews.js';
import type { StaffRoleFields } from '../createStaffRole/createStaffRoleCommand.js';

export type UpdateStaffRoleResult =
  | { outcome: 'updated'; role: StaffRoleView }
  | { outcome: 'role_not_found' | 'role_name_taken' | 'system_role_immutable' }
  | { outcome: 'invalid'; fieldErrors: Record<string, string> };

/** New name, description and permissions for a custom role; its members see them within 30 s. */
export class UpdateStaffRoleCommand extends ICommand<UpdateStaffRoleResult> {
  constructor(
    readonly roleId: string,
    readonly fields: StaffRoleFields,
  ) {
    super();
  }
}
