import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { RunSweepCommand } from '../../../../../src/application/features/events/commands/runSweep/runSweepCommand.js';
import { RunSweepCommandHandler } from '../../../../../src/application/features/events/commands/runSweep/runSweepCommandHandler.js';
import type { IEventLogger, IScheduledJob } from '../../../../../src/application/features/events/common/ports.js';
import type { DomainEvent } from '../../../../../src/domain/events/domainEvent.js';
import { FixedClock } from '../../../../fakes/fakeClock.js';
import { FakeEventPublisher } from '../../../../fakes/fakeEventPublisher.js';
import { FakeJobLockStore } from '../../../../fakes/fakeJobLockStore.js';
import { FakeOutboxStore } from '../../../../fakes/fakeOutboxStore.js';

const T0 = new Date('2026-09-28T18:00:00.000Z');
const event = (id: string): DomainEvent => ({ id, type: 'booking.created', version: 1, occurredAt: T0, bookingId: `b-${id}`, requestId: 'r-1', payload: {} });

let outbox: FakeOutboxStore;
let publisher: FakeEventPublisher;
let clock: FixedClock;
let logger: { info: Mock<IEventLogger['info']>; warn: Mock<IEventLogger['warn']> };
let jobLocks: FakeJobLockStore;

function handler(jobs: IScheduledJob[] = []) {
  return new RunSweepCommandHandler({ outbox, publisher, clock, logger, batchLimit: 200, pendingWarningMinutes: 5, jobs, jobLocks });
}
const sweep = (jobs: IScheduledJob[] = []) => handler(jobs).handle(new RunSweepCommand());

beforeEach(() => {
  outbox = new FakeOutboxStore();
  publisher = new FakeEventPublisher();
  clock = new FixedClock(T0);
  logger = { info: vi.fn<IEventLogger['info']>(), warn: vi.fn<IEventLogger['warn']>() };
  jobLocks = new FakeJobLockStore();
});

describe('RunSweepCommandHandler — US2: pending events are published by the sweep', () => {
  it('publishes events whose relay lease expired, marks them, and reports it', async () => {
    outbox.append([event('e1'), event('e2')], T0);
    clock.set('2026-09-28T18:01:00.000Z');

    expect(await sweep()).toEqual({ published: 2, stillPending: 0, oldestPendingSeconds: null, jobs: [] });
    expect(publisher.published().map((published) => published.id)).toEqual(['e1', 'e2']);
    expect(outbox.pending()).toHaveLength(0);
  });

  it('leaves events alone while the in-request relay still holds them (30 s)', async () => {
    outbox.append([event('e1')], T0);
    clock.set('2026-09-28T18:00:20.000Z');

    expect(await sweep()).toMatchObject({ published: 0, stillPending: 1 });
  });

  it('leaves events pending when publishing fails, and a later sweep publishes them', async () => {
    outbox.append([event('e1')], T0);
    clock.set('2026-09-28T18:01:00.000Z');
    publisher.failNextWith(new Error('pubsub down'));

    expect(await sweep()).toMatchObject({ published: 0, stillPending: 1 });
    clock.set('2026-09-28T18:02:01.000Z'); // the sweep's 60 s lease expired

    expect(await sweep()).toMatchObject({ published: 1, stillPending: 0 });
    expect(outbox.all()[0]!.attempts).toBe(2);
  });

  it('publishes nothing twice', async () => {
    outbox.append([event('e1')], T0);
    clock.set('2026-09-28T18:01:00.000Z');
    await sweep();

    expect(await sweep()).toMatchObject({ published: 0 });
    expect(publisher.published()).toHaveLength(1);
  });

  it('two concurrent sweeps over 100 pending events publish 100 in total', async () => {
    outbox.append(Array.from({ length: 100 }, (_, index) => event(`e${index}`)), T0);
    clock.set('2026-09-28T18:01:00.000Z');

    const [first, second] = await Promise.all([sweep(), sweep()]);

    expect(first.published + second.published).toBe(100);
    expect(publisher.published()).toHaveLength(100);
    expect(new Set(publisher.published().map((published) => published.id)).size).toBe(100);
  });

  it('warns when the oldest pending event is older than 5 minutes', async () => {
    outbox.append([event('e1')], T0);
    publisher.failNextWith(new Error('down'));
    clock.set('2026-09-28T18:06:00.000Z');

    expect(await sweep()).toMatchObject({ stillPending: 1, oldestPendingSeconds: 360 });
    expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'events_pending_too_long', count: 1 }), expect.any(String));
  });
});

describe('RunSweepCommandHandler — US4: time-based jobs run every minute, once', () => {
  function job(name: string, run: (now: Date) => Promise<string | void>, leaseSeconds = 120): IScheduledJob & { runs: number } {
    const counted = {
      name,
      leaseSeconds,
      runs: 0,
      async run(now: Date) {
        counted.runs += 1;
        return run(now);
      },
    };
    return counted;
  }

  it('runs every job and reports what each did; a failing job does not stop the others', async () => {
    const broken = job('broken', async () => {
      throw new Error('boom');
    });
    const fine = job('fine', async () => 'expired 3 bookings');

    const report = await sweep([broken, fine]);

    expect(report.jobs).toEqual([
      { name: 'broken', outcome: 'failed', detail: 'boom' },
      { name: 'fine', outcome: 'succeeded', detail: 'expired 3 bookings' },
    ]);
    expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'scheduled_job_failed', job: 'broken' }), expect.any(String));
  });

  it('skips a job another sweep is still running', async () => {
    await jobLocks.tryAcquire('slow', T0, 120);

    expect((await sweep([job('slow', async () => undefined)])).jobs).toEqual([
      { name: 'slow', outcome: 'skipped', detail: 'another sweep is running it' },
    ]);
  });

  it('two concurrent sweeps run each job once', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const slow = job('slow', async () => {
      await gate;
    });

    const both = Promise.all([sweep([slow]), sweep([slow])]);
    release();
    const reports = await both;

    expect(slow.runs).toBe(1);
    expect(reports.map((report) => report.jobs[0]!.outcome).sort()).toEqual(['skipped', 'succeeded']);
  });

  it('releases the lease after the run, so the next minute runs the job again', async () => {
    const minutely = job('minutely', async () => undefined);
    await sweep([minutely]);
    clock.set('2026-09-28T18:01:00.000Z');

    await sweep([minutely]);

    expect(minutely.runs).toBe(2);
  });

  it('still runs the jobs when publishing events fails', async () => {
    outbox.append([event('e1')], T0);
    clock.set('2026-09-28T18:01:00.000Z');
    publisher.failNextWith(new Error('down'));
    const fine = job('fine', async () => undefined);

    const report = await sweep([fine]);

    expect(report).toMatchObject({ published: 0, stillPending: 1, jobs: [{ name: 'fine', outcome: 'succeeded' }] });
  });
});
