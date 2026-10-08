import type { IClock } from '../../../../common/clock.js';
import type { ICommandHandler } from '../../../../common/mediator/types.js';
import { canAssignRole, canManageMember } from '../../../../../domain/staff/teamRules.js';
import type { IStaffAccessResolver, IStaffMemberRepository, IStaffRoleRepository } from '../../common/ports.js';
import { ChangeStaffMemberRoleCommand, type ChangeStaffMemberRoleResult } from './changeStaffMemberRoleCommand.js';

export interface ChangeStaffMemberRoleDependencies {
  members: IStaffMemberRepository;
  roles: IStaffRoleRepository;
  clock: IClock;
  accessResolver: IStaffAccessResolver;
}

/**
 * Only an owner gives or takes away the owner role, or changes an owner's role; the change never
 * leaves the team without an active owner (one transaction). The member gets the new permissions
 * now in this process and within the access cache elsewhere.
 */
export class ChangeStaffMemberRoleCommandHandler implements ICommandHandler<ChangeStaffMemberRoleCommand, ChangeStaffMemberRoleResult> {
  constructor(private readonly deps: ChangeStaffMemberRoleDependencies) {}

  async handle(command: ChangeStaffMemberRoleCommand): Promise<ChangeStaffMemberRoleResult> {
    const member = await this.deps.members.getById(command.staffId);
    if (!member) return { outcome: 'staff_not_found' };
    if (!(await this.deps.roles.getById(command.roleId))) return { outcome: 'role_not_found' };
    if (!canManageMember(command.actor, member) || !canAssignRole(command.actor, member.roleId, command.roleId)) {
      return { outcome: 'owner_requires_owner' };
    }
    if (member.roleId === command.roleId) return { outcome: 'unchanged', member };

    const changed = member.changeRole(command.roleId, this.deps.clock.now());
    if ((await this.deps.members.saveGuardingOwners(changed)) === 'last_owner') return { outcome: 'last_owner' };
    this.deps.accessResolver.invalidate();
    return { outcome: 'changed', member: changed };
  }
}
