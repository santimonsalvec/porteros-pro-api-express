import type { IOutboxAdminReader, PendingEventRecord } from '../../src/application/features/events/common/adminPorts.js';
import type { IOutboxStore } from '../../src/application/features/events/common/ports.js';
import type { DomainEvent } from '../../src/domain/events/domainEvent.js';

export interface FakeOutboxEntry {
  event: DomainEvent;
  status: 'pending' | 'published';
  attempts: number;
  claimedUntil: Date;
  publishedAt: Date | null;
  createdAt: Date;
}

/** In-memory outbox with the Mongo store's rules: 30 s initial lease, leased claims, oldest first. */
export class FakeOutboxStore implements IOutboxStore, IOutboxAdminReader {
  private readonly entries = new Map<string, FakeOutboxEntry>();

  /** What `appendEventsInSession` does inside a store's transaction. */
  append(events: readonly DomainEvent[], now: Date): void {
    for (const event of events) {
      this.entries.set(event.id, {
        event,
        status: 'pending',
        attempts: 0,
        claimedUntil: new Date(now.getTime() + 30_000),
        publishedAt: null,
        createdAt: now,
      });
    }
  }

  all(): FakeOutboxEntry[] {
    return [...this.entries.values()];
  }

  pending(): FakeOutboxEntry[] {
    return this.all().filter((entry) => entry.status === 'pending');
  }

  async markPublished(ids: readonly string[], at: Date): Promise<void> {
    for (const id of ids) {
      const entry = this.entries.get(id);
      if (entry) Object.assign(entry, { status: 'published', publishedAt: at });
    }
  }

  async claimNext(now: Date, leaseSeconds: number, limit: number): Promise<DomainEvent[]> {
    // No await between the check and the update: atomic, like findOneAndUpdate.
    const claimable = this.pending()
      .filter((entry) => entry.claimedUntil <= now)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .slice(0, limit);
    for (const entry of claimable) {
      entry.claimedUntil = new Date(now.getTime() + leaseSeconds * 1000);
      entry.attempts += 1;
    }
    return claimable.map((entry) => entry.event);
  }

  async pendingStats(): Promise<{ count: number; oldestCreatedAt: Date | null }> {
    const pending = this.pending().sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    return { count: pending.length, oldestCreatedAt: pending[0]?.createdAt ?? null };
  }

  async listPending(filter: { retried: boolean }, page: number, pageSize: number): Promise<{ items: PendingEventRecord[]; totalItems: number }> {
    const matching = this.pending()
      .filter((entry) => !filter.retried || entry.attempts >= 2)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || (a.event.id < b.event.id ? -1 : 1));
    return {
      items: matching.slice((page - 1) * pageSize, page * pageSize).map((entry) => ({
        id: entry.event.id,
        type: entry.event.type,
        bookingId: entry.event.bookingId,
        requestId: entry.event.requestId,
        createdAt: entry.createdAt,
        attempts: entry.attempts,
        claimedUntil: entry.claimedUntil,
      })),
      totalItems: matching.length,
    };
  }

  async retriedCount(): Promise<number> {
    return this.pending().filter((entry) => entry.attempts >= 2).length;
  }
}
