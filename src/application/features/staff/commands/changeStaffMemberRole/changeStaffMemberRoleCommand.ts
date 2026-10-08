import { ICommand } from '../../../../common/mediator/types.js';
import type { StaffActor } from '../../../../../domain/staff/staffActor.js';
import type { StaffMember } from '../../../../../domain/staff/staffMember.js';

export type ChangeStaffMemberRoleResult =
  | { outcome: 'changed' | 'unchanged'; member: StaffMember }
  | { outcome: 'staff_not_found' | 'role_not_found' | 'owner_requires_owner' | 'last_owner' };

/** Gives a member another role; the reason goes to the audit log (spec 002, US2). */
export class ChangeStaffMemberRoleCommand extends ICommand<ChangeStaffMemberRoleResult> {
  constructor(
    readonly staffId: string,
    readonly roleId: string,
    readonly actor: StaffActor,
  ) {
    super();
  }
}
