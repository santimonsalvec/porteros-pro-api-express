import type { IAdminSessionStore } from '../../src/application/features/staff/common/ports.js';
import type { AdminSession, AdminSessionRevokedReason } from '../../src/domain/staff/adminSession.js';

export class FakeAdminSessionStore implements IAdminSessionStore {
  readonly sessions = new Map<string, AdminSession>();

  async add(session: AdminSession): Promise<void> {
    this.sessions.set(session.id, session);
  }

  async getById(id: string): Promise<AdminSession | null> {
    return this.sessions.get(id) ?? null;
  }

  async findByRefreshHash(refreshTokenHash: string): Promise<AdminSession | null> {
    return [...this.sessions.values()].find((session) => session.refreshTokenHash === refreshTokenHash) ?? null;
  }

  async findByPreviousRefreshHash(refreshTokenHash: string): Promise<AdminSession | null> {
    return [...this.sessions.values()].find((session) => session.previousRefreshTokenHash === refreshTokenHash) ?? null;
  }

  async replaceIfCurrent(session: AdminSession, expectedHash: string): Promise<boolean> {
    if (this.sessions.get(session.id)?.refreshTokenHash !== expectedHash) return false;
    this.sessions.set(session.id, session);
    return true;
  }

  async update(session: AdminSession): Promise<void> {
    this.sessions.set(session.id, session);
  }

  async revokeAllForStaff(staffId: string, reason: AdminSessionRevokedReason, now: Date): Promise<string[]> {
    const open = [...this.sessions.values()].filter((session) => session.staffId === staffId && session.revokedAt === null);
    for (const session of open) this.sessions.set(session.id, session.revoke(reason, now));
    return open.map((session) => session.id);
  }
}
