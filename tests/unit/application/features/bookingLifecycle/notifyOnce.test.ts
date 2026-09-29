import { describe, expect, it } from 'vitest';
import { notifyOnce } from '../../../../../src/application/features/bookingLifecycle/common/notifyOnce.js';
import { offerHarness } from '../notifications/offerHarness.js';

describe('notifyOnce (feature 019)', () => {
  it('writes the inbox entry and pushes once per dedupe key', async () => {
    const h = offerHarness();
    await h.phone('client-a');
    let n = 0;
    const deps = { notifications: h.notifications, pushNotifier: h.pushNotifier, idGenerator: { newId: () => `id-${++n}` }, clock: h.clock };
    const message = { title: 'T', body: 'B', data: { type: 'request.complete', requestId: 'r-1' } };

    expect(await notifyOnce(deps, { userId: 'client-a', message, dedupeKey: 'k-1' })).toBe(1);
    expect(await notifyOnce(deps, { userId: 'client-a', message, dedupeKey: 'k-1' })).toBeNull();

    expect(h.notifications.all()).toMatchObject([{ userId: 'client-a', type: 'request.complete', dedupeKey: 'k-1', data: message.data }]);
    expect(h.pushSender.calls).toHaveLength(1);
  });

  it('keeps the inbox entry for a user without devices', async () => {
    const h = offerHarness();
    const deps = { notifications: h.notifications, pushNotifier: h.pushNotifier, idGenerator: { newId: () => 'id-1' }, clock: h.clock };

    expect(await notifyOnce(deps, { userId: 'nobody', message: { title: 'T', body: 'B', data: { type: 'x' } }, dedupeKey: 'k' })).toBe(0);
    expect(h.notifications.all()).toHaveLength(1);
  });
});
