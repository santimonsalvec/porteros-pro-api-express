import type { IClock } from '../../../../common/clock.js';
import type { ICommandHandler } from '../../../../common/mediator/types.js';
import { OWNER_ROLE_ID, StaffRole, StaffRoleValidationError } from '../../../../../domain/staff/staffRole.js';
import type { IStaffAccessResolver, IStaffRoleRepository } from '../../common/ports.js';
import { UpsertStaffRoleCommand, type UpsertStaffRoleResult } from './upsertStaffRoleCommand.js';

export interface UpsertStaffRoleDependencies {
  roles: IStaffRoleRepository;
  clock: IClock;
  accessResolver: IStaffAccessResolver;
}

/** Saves a custom role; every cached access is forgotten so its members get the change at once here. */
export class UpsertStaffRoleCommandHandler implements ICommandHandler<UpsertStaffRoleCommand, UpsertStaffRoleResult> {
  constructor(private readonly deps: UpsertStaffRoleDependencies) {}

  async handle(command: UpsertStaffRoleCommand): Promise<UpsertStaffRoleResult> {
    if (command.role.id === OWNER_ROLE_ID) return { outcome: 'system_role_immutable' };
    const now = this.deps.clock.now();
    const existing = await this.deps.roles.getById(command.role.id);
    try {
      const role = existing ? existing.withChanges(command.role, now) : StaffRole.create(command.role, now);
      await this.deps.roles.upsert(role);
    } catch (error) {
      if (error instanceof StaffRoleValidationError) return { outcome: 'invalid', fieldErrors: error.fieldErrors };
      throw error;
    }
    this.deps.accessResolver.invalidate();
    return { outcome: existing ? 'updated' : 'created' };
  }
}
