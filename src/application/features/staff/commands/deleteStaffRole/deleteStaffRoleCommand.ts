import { ICommand } from '../../../../common/mediator/types.js';

export type DeleteStaffRoleResult =
  | { outcome: 'deleted' | 'role_not_found' | 'system_role_immutable' }
  | { outcome: 'role_in_use'; memberCount: number };

/** Deletes a custom role nobody has (spec 002, FR-013); the reason goes to the audit log. */
export class DeleteStaffRoleCommand extends ICommand<DeleteStaffRoleResult> {
  constructor(readonly roleId: string) {
    super();
  }
}
