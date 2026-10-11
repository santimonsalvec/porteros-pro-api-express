import type { IStaffMemberRepository, StaffMemberListQuery } from '../../src/application/features/staff/common/ports.js';
import type { StaffMember } from '../../src/domain/staff/staffMember.js';
import { OWNER_ROLE_ID } from '../../src/domain/staff/staffRole.js';

export class FakeStaffMemberRepository implements IStaffMemberRepository {
  readonly members = new Map<string, StaffMember>();
  /** How many owner-guarded saves ran (each one is a transaction in Mongo). */
  guardedSaves = 0;

  async getById(id: string): Promise<StaffMember | null> {
    return this.members.get(id) ?? null;
  }

  async findByEmail(email: string): Promise<StaffMember | null> {
    return [...this.members.values()].find((member) => member.email === email) ?? null;
  }

  async findByUserId(userId: string): Promise<StaffMember | null> {
    return [...this.members.values()].find((member) => member.userId === userId) ?? null;
  }

  async add(member: StaffMember): Promise<void> {
    if (await this.findByEmail(member.email)) throw new Error(`Duplicate staff email ${member.email}`);
    this.members.set(member.id, member);
  }

  async update(member: StaffMember): Promise<void> {
    this.members.set(member.id, member);
  }

  async saveGuardingOwners(member: StaffMember): Promise<'saved' | 'last_owner'> {
    this.guardedSaves += 1;
    const after = new Map(this.members).set(member.id, member);
    const owners = [...after.values()].filter((m) => m.status === 'active' && m.roleIds.includes(OWNER_ROLE_ID));
    const hadOwner = [...this.members.values()].some((m) => m.status === 'active' && m.roleIds.includes(OWNER_ROLE_ID));
    if (hadOwner && owners.length === 0) return 'last_owner';
    this.members.set(member.id, member);
    return 'saved';
  }

  async list(query: StaffMemberListQuery): Promise<{ items: StaffMember[]; totalItems: number }> {
    const q = query.q?.toLowerCase();
    const matching = [...this.members.values()]
      .filter((m) => !query.status || m.status === query.status)
      .filter((m) => !query.roleId || m.roleIds.includes(query.roleId))
      .filter((m) => !q || m.email.startsWith(q) || (m.displayName ?? '').toLowerCase().startsWith(q))
      .sort((a, b) => a.email.localeCompare(b.email));
    const start = (query.page - 1) * query.pageSize;
    return { items: matching.slice(start, start + query.pageSize), totalItems: matching.length };
  }

  async countByRole(roleIds: readonly string[]): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    for (const member of this.members.values()) {
      for (const roleId of member.roleIds) if (roleIds.includes(roleId)) counts.set(roleId, (counts.get(roleId) ?? 0) + 1);
    }
    return counts;
  }
}
