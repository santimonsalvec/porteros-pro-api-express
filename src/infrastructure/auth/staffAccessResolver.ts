import type { IClock } from '../../application/common/clock.js';
import type {
  IAdminSessionStore,
  IStaffAccessResolver,
  IStaffMemberRepository,
  IStaffRoleRepository,
  ResolvedStaffAccess,
} from '../../application/features/staff/common/ports.js';

/** How long a resolved session is trusted before reading it again (spec 001, FR-010). */
export const STAFF_ACCESS_CACHE_MS = 30 * 1000;

interface CacheEntry {
  access: ResolvedStaffAccess;
  cachedAt: number;
}

/**
 * Resolves an admin access token's session to its member and role on every request, with an
 * in-memory cache per process (research §4). A change made in this process invalidates its entry
 * at once; other instances notice within the cache time. Only valid access is cached, and the
 * session's own time limits are re-checked on every hit.
 */
export class StaffAccessResolver implements IStaffAccessResolver {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly sessions: IAdminSessionStore,
    private readonly members: IStaffMemberRepository,
    private readonly roles: IStaffRoleRepository,
    private readonly clock: IClock,
    private readonly cacheMs: number = STAFF_ACCESS_CACHE_MS,
  ) {}

  async resolve(sessionId: string): Promise<ResolvedStaffAccess | null> {
    const now = this.clock.now();
    const cached = this.cache.get(sessionId);
    if (cached && now.getTime() - cached.cachedAt < this.cacheMs) {
      return cached.access.session.isValid(now) ? cached.access : null;
    }
    this.cache.delete(sessionId);

    const access = await this.load(sessionId, now);
    if (access) this.cache.set(sessionId, { access, cachedAt: now.getTime() });
    return access;
  }

  invalidate(sessionId?: string): void {
    if (sessionId === undefined) this.cache.clear();
    else this.cache.delete(sessionId);
  }

  private async load(sessionId: string, now: Date): Promise<ResolvedStaffAccess | null> {
    const session = await this.sessions.getById(sessionId);
    if (!session?.isValid(now)) return null;
    const member = await this.members.getById(session.staffId);
    if (!member?.hasAccess()) return null;
    const role = await this.roles.getById(member.roleId);
    if (!role) return null;
    return { session, member, role, permissions: role.effectivePermissions(), isOwner: role.isOwner };
  }
}
