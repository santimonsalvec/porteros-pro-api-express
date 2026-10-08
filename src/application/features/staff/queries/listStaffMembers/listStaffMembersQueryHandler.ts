import type { IClock } from '../../../../common/clock.js';
import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { IStaffMemberRepository, IStaffRoleRepository } from '../../common/ports.js';
import { pageOf, toStaffMemberViews } from '../../common/staffViews.js';
import { ListStaffMembersQuery, type ListStaffMembersResult } from './listStaffMembersQuery.js';

export interface StaffQueryDependencies {
  members: IStaffMemberRepository;
  roles: IStaffRoleRepository;
  clock: IClock;
}

export class ListStaffMembersQueryHandler implements IQueryHandler<ListStaffMembersQuery, ListStaffMembersResult> {
  constructor(private readonly deps: StaffQueryDependencies) {}

  async handle(query: ListStaffMembersQuery): Promise<ListStaffMembersResult> {
    const { items, totalItems } = await this.deps.members.list({ ...query.filters, page: query.page, pageSize: query.pageSize });
    const views = await toStaffMemberViews(items, this.deps, this.deps.clock.now());
    return pageOf(views, query.page, query.pageSize, totalItems);
  }
}
