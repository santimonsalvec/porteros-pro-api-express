import type { StaffRole } from '../../../../domain/staff/staffRole.js';
import type { IStaffMemberRepository } from './ports.js';
import { toStaffRoleView, type StaffRoleView } from './staffViews.js';

/** One role as a view, counting its members. */
export async function roleView(role: StaffRole, members: IStaffMemberRepository): Promise<StaffRoleView> {
  const counts = await members.countByRole([role.id]);
  return toStaffRoleView(role, counts.get(role.id) ?? 0);
}
