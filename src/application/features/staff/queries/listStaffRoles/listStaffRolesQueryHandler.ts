import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { IStaffMemberRepository, IStaffRoleRepository } from '../../common/ports.js';
import { pageOf, toStaffRoleView } from '../../common/staffViews.js';
import { ListStaffRolesQuery, type ListStaffRolesResult } from './listStaffRolesQuery.js';

export interface StaffRoleQueryDependencies {
  members: IStaffMemberRepository;
  roles: IStaffRoleRepository;
}

export class ListStaffRolesQueryHandler implements IQueryHandler<ListStaffRolesQuery, ListStaffRolesResult> {
  constructor(private readonly deps: StaffRoleQueryDependencies) {}

  async handle(query: ListStaffRolesQuery): Promise<ListStaffRolesResult> {
    const { items, totalItems } = await this.deps.roles.list(query.page, query.pageSize);
    const counts = await this.deps.members.countByRole(items.map((role) => role.id));
    const views = items.map((role) => toStaffRoleView(role, counts.get(role.id) ?? 0));
    return pageOf(views, query.page, query.pageSize, totalItems);
  }
}
