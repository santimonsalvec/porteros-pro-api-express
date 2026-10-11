import { ICommand } from '../../../../common/mediator/types.js';
import type { StaffActor } from '../../../../../domain/staff/staffActor.js';
import type { StaffMember } from '../../../../../domain/staff/staffMember.js';

export type SetStaffMemberStatusResult =
  | { outcome: 'disabled' | 'enabled' | 'unchanged'; member: StaffMember }
  | { outcome: 'not_found' | 'last_owner' | 'cannot_disable_self' | 'owner_requires_owner' };

/** Disables a staff member (all their admin sessions end at once) or enables them again. */
export class SetStaffMemberStatusCommand extends ICommand<SetStaffMemberStatusResult> {
  constructor(
    readonly staffId: string,
    readonly status: 'disabled' | 'active',
    /** Who acts: nobody disables themselves; only an owner touches an owner (spec 002). */
    readonly actor: StaffActor,
  ) {
    super();
  }
}
