import { ICommand } from '../../../../common/mediator/types.js';
import type { StaffRoleInput } from '../../../../../domain/staff/staffRole.js';

export type UpsertStaffRoleResult =
  | { outcome: 'created' | 'updated' }
  | { outcome: 'system_role_immutable' }
  | { outcome: 'invalid'; fieldErrors: Record<string, string> };

/** Creates or replaces a custom role (its screen arrives with spec 002; for now `scripts/staff.ts`). */
export class UpsertStaffRoleCommand extends ICommand<UpsertStaffRoleResult> {
  constructor(readonly role: StaffRoleInput) {
    super();
  }
}
