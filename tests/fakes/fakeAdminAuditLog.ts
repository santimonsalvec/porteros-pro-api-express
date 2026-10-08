import type { AuditLogQuery, IAdminAuditLog, IAdminAuditLogReader } from '../../src/application/features/staff/common/ports.js';
import type { AuditEntry } from '../../src/domain/staff/auditEntry.js';

export class FakeAdminAuditLog implements IAdminAuditLog, IAdminAuditLogReader {
  readonly entries: AuditEntry[] = [];
  /** How many of the next appends fail, to exercise the retry and the error log. */
  failNext = 0;

  async append(entry: AuditEntry): Promise<void> {
    if (this.failNext > 0) {
      this.failNext -= 1;
      throw new Error('audit store unavailable');
    }
    this.entries.push(entry);
  }

  async list(query: AuditLogQuery): Promise<AuditEntry[]> {
    const newestFirst = [...this.entries].sort((a, b) => b.at.getTime() - a.at.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
    return newestFirst
      .filter((e) => !query.staffId || ('staffId' in e.actor && e.actor.staffId === query.staffId))
      .filter((e) => !query.resourceType || e.resourceType === query.resourceType)
      .filter((e) => !query.action || e.action === query.action)
      .filter((e) => !query.outcome || e.outcome === query.outcome)
      .filter((e) => !query.from || e.at >= query.from)
      .filter((e) => !query.to || e.at <= query.to)
      .filter((e) => {
        const after = query.after;
        if (!after) return true;
        return e.at < after.at || (e.at.getTime() === after.at.getTime() && e.id < after.id);
      })
      .slice(0, query.limit);
  }

  async getById(id: string): Promise<AuditEntry | null> {
    return this.entries.find((entry) => entry.id === id) ?? null;
  }
}
