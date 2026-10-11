import type { IClock } from '../../../../common/clock.js';
import type { ICommandHandler } from '../../../../common/mediator/types.js';
import { OWNER_ROLE_ID, slugFromName, StaffRole, StaffRoleValidationError } from '../../../../../domain/staff/staffRole.js';
import type { IStaffAccessResolver, IStaffMemberRepository, IStaffRoleRepository } from '../../common/ports.js';
import { toStaffRoleView } from '../../common/staffViews.js';
import { CreateStaffRoleCommand, type CreateStaffRoleResult } from './createStaffRoleCommand.js';

export interface StaffRoleCommandDependencies {
  members: IStaffMemberRepository;
  roles: IStaffRoleRepository;
  clock: IClock;
  accessResolver: IStaffAccessResolver;
}

const MAX_SUFFIX = 50;

export class CreateStaffRoleCommandHandler implements ICommandHandler<CreateStaffRoleCommand, CreateStaffRoleResult> {
  constructor(private readonly deps: StaffRoleCommandDependencies) {}

  async handle(command: CreateStaffRoleCommand): Promise<CreateStaffRoleResult> {
    if (command.role.id === OWNER_ROLE_ID) return { outcome: 'system_role_immutable' };
    const id = command.role.id ?? (await this.freeIdFor(command.role.name));
    if (!id) return { outcome: 'invalid', fieldErrors: { name: 'Must contain letters and start with one.' } };

    let role: StaffRole;
    try {
      role = StaffRole.create({ ...command.role, id }, this.deps.clock.now());
    } catch (error) {
      if (error instanceof StaffRoleValidationError) return { outcome: 'invalid', fieldErrors: error.fieldErrors };
      throw error;
    }
    if ((await this.deps.roles.create(role)) === 'name_taken') return { outcome: 'role_name_taken' };
    return { outcome: 'created', role: toStaffRoleView(role, 0) };
  }

  /** The slug of the name, with `-2`, `-3`… when another role already has it. */
  private async freeIdFor(name: string): Promise<string | null> {
    const base = slugFromName(name);
    if (!base || base === OWNER_ROLE_ID) return base === OWNER_ROLE_ID ? `${base}-2` : null;
    for (let suffix = 1; suffix <= MAX_SUFFIX; suffix += 1) {
      const candidate = suffix === 1 ? base : `${base.slice(0, 40 - String(suffix).length - 1)}-${suffix}`;
      if (!(await this.deps.roles.getById(candidate))) return candidate;
    }
    return null;
  }
}
