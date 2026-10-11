import type { ICommandHandler } from '../../../../common/mediator/types.js';
import { OWNER_ROLE_ID } from '../../../../../domain/staff/staffRole.js';
import type { StaffRoleCommandDependencies } from '../createStaffRole/createStaffRoleCommandHandler.js';
import { DeleteStaffRoleCommand, type DeleteStaffRoleResult } from './deleteStaffRoleCommand.js';

export class DeleteStaffRoleCommandHandler implements ICommandHandler<DeleteStaffRoleCommand, DeleteStaffRoleResult> {
  constructor(private readonly deps: StaffRoleCommandDependencies) {}

  async handle(command: DeleteStaffRoleCommand): Promise<DeleteStaffRoleResult> {
    if (command.roleId === OWNER_ROLE_ID) return { outcome: 'system_role_immutable' };
    const outcome = await this.deps.roles.deleteIfUnused(command.roleId);
    if (outcome === 'not_found') return { outcome: 'role_not_found' };
    if (outcome === 'in_use') {
      const counts = await this.deps.members.countByRole([command.roleId]);
      return { outcome: 'role_in_use', memberCount: counts.get(command.roleId) ?? 0 };
    }
    return { outcome: 'deleted' };
  }
}
