import { ICommand } from '../../../../common/mediator/types.js';
import type { StaffRoleView } from '../../common/staffViews.js';

export interface StaffRoleFields {
  name: string;
  description: string;
  permissions: readonly string[];
}

export type CreateStaffRoleResult =
  | { outcome: 'created'; role: StaffRoleView }
  | { outcome: 'role_name_taken' | 'system_role_immutable' }
  | { outcome: 'invalid'; fieldErrors: Record<string, string> };

/** A new custom role; without an id, one is made from its name (spec 002, US3). */
export class CreateStaffRoleCommand extends ICommand<CreateStaffRoleResult> {
  constructor(readonly role: StaffRoleFields & { id?: string }) {
    super();
  }
}
