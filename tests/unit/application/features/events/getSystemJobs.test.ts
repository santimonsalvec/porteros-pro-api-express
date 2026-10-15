import { describe, expect, it } from 'vitest';
import { GetSystemJobsQuery } from '../../../../../src/application/features/events/queries/getSystemJobs/getSystemJobsQuery.js';
import { GetSystemJobsQueryHandler } from '../../../../../src/application/features/events/queries/getSystemJobs/getSystemJobsQueryHandler.js';
import { FakeJobLockStore } from '../../../../fakes/fakeJobLockStore.js';

const NOW = new Date('2026-10-13T14:02:00.000Z');
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);
const job = (name: string) => ({ name, leaseSeconds: 55, run: async () => undefined });

describe('GetSystemJobsQueryHandler (admin spec 008, research §8)', () => {
  it("shows each registered job's last start, whether it runs now, and the late ones, in the sweep's order", async () => {
    const locks = new FakeJobLockStore();
    await locks.tryAcquire('booking-expiry', minutesAgo(1), 55);
    await locks.release('booking-expiry', minutesAgo(1));
    await locks.tryAcquire('offer-reminders', new Date(NOW.getTime() - 10_000), 55);
    await locks.tryAcquire('deposit-reconcile', minutesAgo(10), 55);
    await locks.release('deposit-reconcile', minutesAgo(10));
    const handler = new GetSystemJobsQueryHandler({ jobs: [job('booking-expiry'), job('offer-reminders'), job('deposit-reconcile'), job('invoicing-issuer')], locks, clock: { now: () => NOW } });

    const result = await handler.handle(new GetSystemJobsQuery());

    expect(result).toEqual({
      checkedAt: NOW,
      lateAfterMinutes: 5,
      sweepLate: false,
      jobs: [
        { name: 'booking-expiry', leaseSeconds: 55, lastStartedAt: minutesAgo(1), running: false, leaseUntil: null, late: false },
        { name: 'offer-reminders', leaseSeconds: 55, lastStartedAt: new Date(NOW.getTime() - 10_000), running: true, leaseUntil: new Date(NOW.getTime() + 45_000), late: false },
        { name: 'deposit-reconcile', leaseSeconds: 55, lastStartedAt: minutesAgo(10), running: false, leaseUntil: null, late: true },
        { name: 'invoicing-issuer', leaseSeconds: 55, lastStartedAt: null, running: false, leaseUntil: null, late: true },
      ],
    });
  });

  it('says the sweep is late when every job is', async () => {
    const handler = new GetSystemJobsQueryHandler({ jobs: [job('booking-expiry'), job('cancel-all')], locks: new FakeJobLockStore(), clock: { now: () => NOW } });
    expect((await handler.handle(new GetSystemJobsQuery())).sweepLate).toBe(true);
  });
});
