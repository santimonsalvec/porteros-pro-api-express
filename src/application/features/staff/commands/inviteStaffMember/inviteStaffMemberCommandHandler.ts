import type { IClock } from '../../../../common/clock.js';
import type { ICommandHandler } from '../../../../common/mediator/types.js';
import type { IIdGenerator } from '../../../auth/common/ports.js';
import { normalizeStaffEmail, StaffMember } from '../../../../../domain/staff/staffMember.js';
import { canAssignRole } from '../../../../../domain/staff/teamRules.js';
import type { IStaffMemberRepository, IStaffRoleRepository } from '../../common/ports.js';
import { InviteStaffMemberCommand, type InviteStaffMemberResult } from './inviteStaffMemberCommand.js';

export interface InviteStaffMemberDependencies {
  members: IStaffMemberRepository;
  roles: IStaffRoleRepository;
  ids: IIdGenerator;
  clock: IClock;
}

/** A new invitation, or 7 more days (and maybe another role) for one still pending. */
export class InviteStaffMemberCommandHandler implements ICommandHandler<InviteStaffMemberCommand, InviteStaffMemberResult> {
  constructor(private readonly deps: InviteStaffMemberDependencies) {}

  async handle(command: InviteStaffMemberCommand): Promise<InviteStaffMemberResult> {
    const email = normalizeStaffEmail(command.email);
    if (!email) return { outcome: 'invalid_email' };
    if (!(await this.deps.roles.getById(command.roleId))) return { outcome: 'role_not_found' };
    if (!canAssignRole(command.actor, '', command.roleId)) return { outcome: 'owner_requires_owner' };

    const now = this.deps.clock.now();
    const existing = await this.deps.members.findByEmail(email);
    if (existing && existing.status !== 'invited') return { outcome: 'already_member' };
    if (existing) {
      await this.deps.members.update(existing.reinvite(command.roleId, command.actor.staffId, now));
      return { outcome: 'reinvited', staffId: existing.id };
    }

    const member = StaffMember.invite({ id: this.deps.ids.newId(), email, roleId: command.roleId, invitedBy: command.actor.staffId }, now);
    await this.deps.members.add(member);
    return { outcome: 'invited', staffId: member.id };
  }
}
