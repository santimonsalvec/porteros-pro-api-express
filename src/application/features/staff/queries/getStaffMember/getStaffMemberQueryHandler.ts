import type { IQueryHandler } from '../../../../common/mediator/types.js';
import { toStaffMemberViews } from '../../common/staffViews.js';
import type { StaffQueryDependencies } from '../listStaffMembers/listStaffMembersQueryHandler.js';
import { GetStaffMemberQuery, type GetStaffMemberResult } from './getStaffMemberQuery.js';

export class GetStaffMemberQueryHandler implements IQueryHandler<GetStaffMemberQuery, GetStaffMemberResult> {
  constructor(private readonly deps: StaffQueryDependencies) {}

  async handle(query: GetStaffMemberQuery): Promise<GetStaffMemberResult> {
    const member = await this.deps.members.getById(query.staffId);
    if (!member) return { outcome: 'staff_not_found' };
    const [view] = await toStaffMemberViews([member], this.deps, this.deps.clock.now());
    return { outcome: 'ok', member: view! };
  }
}
