import { describe, expect, it } from 'vitest';
import { GetSystemEventsQuery } from '../../../../../src/application/features/events/queries/getSystemEvents/getSystemEventsQuery.js';
import { GetSystemEventsQueryHandler } from '../../../../../src/application/features/events/queries/getSystemEvents/getSystemEventsQueryHandler.js';
import type { DomainEvent } from '../../../../../src/domain/events/domainEvent.js';
import { FakeOutboxStore } from '../../../../fakes/fakeOutboxStore.js';

const NOW = new Date('2026-10-13T14:02:00.000Z');
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);
const event = (id: string): DomainEvent => ({ id, type: 'goalkeeper.assigned', version: 1, occurredAt: NOW, bookingId: `bk-${id}`, requestId: 'rq-1', payload: { secret: 'x' } });

function world() {
  const outbox = new FakeOutboxStore();
  outbox.append([event('old')], minutesAgo(14));
  outbox.append([event('mid')], minutesAgo(3));
  outbox.append([event('new')], minutesAgo(0));
  outbox.append([event('done')], minutesAgo(20));
  void outbox.markPublished(['done'], minutesAgo(19));
  outbox.all().find((entry) => entry.event.id === 'old')!.attempts = 15;
  outbox.all().find((entry) => entry.event.id === 'mid')!.attempts = 1;
  const handler = new GetSystemEventsQueryHandler({ outbox, stats: outbox, clock: { now: () => NOW }, stuckAfterMinutes: 5 });
  return { handler };
}

describe('GetSystemEventsQueryHandler (admin spec 008, research §7)', () => {
  it('summarizes every pending event and marks the retried and the stuck, oldest first', async () => {
    const { handler } = world();

    const result = await handler.handle(new GetSystemEventsQuery({ retried: false, page: 1, pageSize: 20 }));

    expect(result.checkedAt).toEqual(NOW);
    expect(result.stuckAfterMinutes).toBe(5);
    expect(result.pending).toEqual({ count: 3, oldestCreatedAt: minutesAgo(14), oldestPendingSeconds: 14 * 60, retriedCount: 1 });
    expect(result.page.items.map((item) => [item.id, item.retried, item.stuck])).toEqual([
      ['old', true, true],
      ['mid', false, false],
      ['new', false, false],
    ]);
    expect(result.page).toMatchObject({ page: 1, pageSize: 20, totalItems: 3, totalPages: 1 });
    expect(JSON.stringify(result)).not.toContain('secret');
  });

  it('keeps the summary of every pending event when the page shows only the retried', async () => {
    const { handler } = world();
    const result = await handler.handle(new GetSystemEventsQuery({ retried: true, page: 1, pageSize: 20 }));
    expect(result.page.items.map((item) => item.id)).toEqual(['old']);
    expect(result.pending.count).toBe(3);
  });

  it('says nothing is pending', async () => {
    const outbox = new FakeOutboxStore();
    const handler = new GetSystemEventsQueryHandler({ outbox, stats: outbox, clock: { now: () => NOW }, stuckAfterMinutes: 5 });
    const result = await handler.handle(new GetSystemEventsQuery({ retried: false, page: 1, pageSize: 20 }));
    expect(result.pending).toEqual({ count: 0, oldestCreatedAt: null, oldestPendingSeconds: null, retriedCount: 0 });
    expect(result.page.items).toEqual([]);
  });
});
