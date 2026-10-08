import type { IQueryHandler } from '../../../../common/mediator/types.js';
import { roleView } from '../../common/roleView.js';
import type { StaffRoleQueryDependencies } from '../listStaffRoles/listStaffRolesQueryHandler.js';
import { GetStaffRoleQuery, type GetStaffRoleResult } from './getStaffRoleQuery.js';

export class GetStaffRoleQueryHandler implements IQueryHandler<GetStaffRoleQuery, GetStaffRoleResult> {
  constructor(private readonly deps: StaffRoleQueryDependencies) {}

  async handle(query: GetStaffRoleQuery): Promise<GetStaffRoleResult> {
    const role = await this.deps.roles.getById(query.roleId);
    return role ? { outcome: 'ok', role: await roleView(role, this.deps.members) } : { outcome: 'role_not_found' };
  }
}
