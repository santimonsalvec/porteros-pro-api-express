import type { IStaffMemberRepository, IStaffRoleRepository } from '../../src/application/features/staff/common/ports.js';
import { OWNER_ROLE_ID, StaffRole } from '../../src/domain/staff/staffRole.js';

export class FakeStaffRoleRepository implements IStaffRoleRepository {
  readonly roles = new Map<string, StaffRole>();

  /** The members fake, so `deleteIfUnused` can count who has a role. */
  constructor(private readonly members?: IStaffMemberRepository) {}

  async getById(id: string): Promise<StaffRole | null> {
    return this.roles.get(id) ?? null;
  }

  async upsert(role: StaffRole): Promise<void> {
    this.roles.set(role.id, role);
  }

  async ensureOwner(now: Date): Promise<StaffRole> {
    const existing = this.roles.get(OWNER_ROLE_ID);
    if (existing) return existing;
    const owner = StaffRole.owner(now);
    this.roles.set(owner.id, owner);
    return owner;
  }

  async list(page: number, pageSize: number): Promise<{ items: StaffRole[]; totalItems: number }> {
    const sorted = [...this.roles.values()].sort((a, b) =>
      a.isOwner !== b.isOwner ? (a.isOwner ? -1 : 1) : a.name.localeCompare(b.name),
    );
    const start = (page - 1) * pageSize;
    return { items: sorted.slice(start, start + pageSize), totalItems: sorted.length };
  }

  async create(role: StaffRole): Promise<'created' | 'name_taken'> {
    if (this.nameTaken(role)) return 'name_taken';
    this.roles.set(role.id, role);
    return 'created';
  }

  async save(role: StaffRole): Promise<'saved' | 'name_taken'> {
    if (this.nameTaken(role)) return 'name_taken';
    this.roles.set(role.id, role);
    return 'saved';
  }

  async deleteIfUnused(roleId: string): Promise<'deleted' | 'in_use' | 'not_found'> {
    if (!this.roles.has(roleId)) return 'not_found';
    const inUse = ((await this.members?.countByRole([roleId]))?.get(roleId) ?? 0) > 0;
    if (inUse) return 'in_use';
    this.roles.delete(roleId);
    return 'deleted';
  }

  private nameTaken(role: StaffRole): boolean {
    return [...this.roles.values()].some((other) => other.id !== role.id && other.name.toLowerCase() === role.name.toLowerCase());
  }
}
