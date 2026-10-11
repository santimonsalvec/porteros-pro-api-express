import type { ICommandHandler } from '../../../../common/mediator/types.js';
import { StaffRoleValidationError, type StaffRole } from '../../../../../domain/staff/staffRole.js';
import { roleView } from '../../common/roleView.js';
import type { StaffRoleCommandDependencies } from '../createStaffRole/createStaffRoleCommandHandler.js';
import { UpdateStaffRoleCommand, type UpdateStaffRoleResult } from './updateStaffRoleCommand.js';

export class UpdateStaffRoleCommandHandler implements ICommandHandler<UpdateStaffRoleCommand, UpdateStaffRoleResult> {
  constructor(private readonly deps: StaffRoleCommandDependencies) {}

  async handle(command: UpdateStaffRoleCommand): Promise<UpdateStaffRoleResult> {
    const existing = await this.deps.roles.getById(command.roleId);
    if (!existing) return { outcome: 'role_not_found' };
    if (existing.system) return { outcome: 'system_role_immutable' };

    let role: StaffRole;
    try {
      role = existing.withChanges(command.fields, this.deps.clock.now());
    } catch (error) {
      if (error instanceof StaffRoleValidationError) return { outcome: 'invalid', fieldErrors: error.fieldErrors };
      throw error;
    }
    if ((await this.deps.roles.save(role)) === 'name_taken') return { outcome: 'role_name_taken' };
    // Its members get the new permissions now here, and within the cache time elsewhere.
    this.deps.accessResolver.invalidate();
    return { outcome: 'updated', role: await roleView(role, this.deps.members) };
  }
}
