import { ICommand } from '../../../../common/mediator/types.js';
import type { StaffActor } from '../../../../../domain/staff/staffActor.js';

export type InviteStaffMemberResult =
  | { outcome: 'invited' | 'reinvited'; staffId: string }
  | { outcome: 'already_member' | 'role_not_found' | 'invalid_email' | 'owner_requires_owner' };

/**
 * Invites an email to the admin web with a role; it activates on the first Google sign-in with
 * that verified email within 7 days (spec 001, US4). Its screen arrives with spec 002.
 */
export class InviteStaffMemberCommand extends ICommand<InviteStaffMemberResult> {
  constructor(
    readonly email: string,
    readonly roleId: string,
    /** Who invites: only an owner (or a script) may invite to the owner role. */
    readonly actor: StaffActor,
  ) {
    super();
  }
}
