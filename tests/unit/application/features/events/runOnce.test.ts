import { describe, expect, it, vi } from 'vitest';
import { runOnce } from '../../../../../src/application/features/events/common/runOnce.js';
import { FixedClock } from '../../../../fakes/fakeClock.js';
import { FakeProcessedEventStore } from '../../../../fakes/fakeProcessedEventStore.js';

describe('runOnce — US3: a repeated delivery does not repeat the effect', () => {
  it('runs the effect the first time and marks the event for that consumer', async () => {
    const store = new FakeProcessedEventStore();
    const effect = vi.fn(async () => undefined);

    expect(await runOnce(store, new FixedClock(), 'delivery-log', 'ev-1', effect)).toBe('processed');
    expect(effect).toHaveBeenCalledTimes(1);
    expect(store.keys).toEqual(new Set(['delivery-log:ev-1']));
  });

  it('skips the effect on a repeat', async () => {
    const store = new FakeProcessedEventStore();
    const effect = vi.fn(async () => undefined);
    await runOnce(store, new FixedClock(), 'delivery-log', 'ev-1', effect);

    expect(await runOnce(store, new FixedClock(), 'delivery-log', 'ev-1', effect)).toBe('duplicate');
    expect(effect).toHaveBeenCalledTimes(1);
  });

  it('keeps consumers apart: another consumer still processes the same event', async () => {
    const store = new FakeProcessedEventStore();
    await runOnce(store, new FixedClock(), 'delivery-log', 'ev-1', async () => undefined);

    expect(await runOnce(store, new FixedClock(), 'notifier', 'ev-1', async () => undefined)).toBe('processed');
  });

  it('does not mark the event when the effect fails, so a retry runs it again', async () => {
    const store = new FakeProcessedEventStore();

    await expect(runOnce(store, new FixedClock(), 'c', 'ev-1', async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect(store.keys.size).toBe(0);
  });
});
