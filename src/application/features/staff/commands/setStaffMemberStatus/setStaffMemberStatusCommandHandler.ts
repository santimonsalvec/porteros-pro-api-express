import type { IClock } from '../../../../common/clock.js';
import type { ICommandHandler } from '../../../../common/mediator/types.js';
import type { StaffMember } from '../../../../../domain/staff/staffMember.js';
import { canDisable, canManageMember } from '../../../../../domain/staff/teamRules.js';
import type { IAdminSessionStore, IStaffAccessResolver, IStaffMemberRepository } from '../../common/ports.js';
import { SetStaffMemberStatusCommand, type SetStaffMemberStatusResult } from './setStaffMemberStatusCommand.js';

export interface SetStaffMemberStatusDependencies {
  members: IStaffMemberRepository;
  sessions: IAdminSessionStore;
  clock: IClock;
  accessResolver: IStaffAccessResolver;
}

/**
 * Disabling never leaves the team without an active owner (one transaction) and revokes every
 * admin session of the member, so their refresh fails at once and their access tokens stop
 * working in this process at once and in the others within the access cache (≤ 30 s).
 */
export class SetStaffMemberStatusCommandHandler implements ICommandHandler<SetStaffMemberStatusCommand, SetStaffMemberStatusResult> {
  constructor(private readonly deps: SetStaffMemberStatusDependencies) {}

  async handle(command: SetStaffMemberStatusCommand): Promise<SetStaffMemberStatusResult> {
    const member = await this.deps.members.getById(command.staffId);
    if (!member) return { outcome: 'not_found' };
    const now = this.deps.clock.now();

    if (command.status === 'active') {
      if (!canManageMember(command.actor, member)) return { outcome: 'owner_requires_owner' };
      if (member.status !== 'disabled') return { outcome: 'unchanged', member };
      const enabled = member.enable(now);
      await this.deps.members.update(enabled);
      return { outcome: 'enabled', member: enabled };
    }

    if (command.actor.staffId === member.id) return { outcome: 'cannot_disable_self' };
    if (!canDisable(command.actor, member)) return { outcome: 'owner_requires_owner' };
    if (member.status === 'disabled') return { outcome: 'unchanged', member };
    const disabled = member.disable(now);
    if ((await this.deps.members.saveGuardingOwners(disabled)) === 'last_owner') return { outcome: 'last_owner' };
    await this.endSessions(member, now);
    return { outcome: 'disabled', member: disabled };
  }

  private async endSessions(member: StaffMember, now: Date): Promise<void> {
    const revoked = await this.deps.sessions.revokeAllForStaff(member.id, 'staff_disabled', now);
    for (const sessionId of revoked) this.deps.accessResolver.invalidate(sessionId);
  }
}
