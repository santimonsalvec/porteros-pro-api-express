import { describe, expect, it } from 'vitest';
import { notifyOnce } from '../../../../../src/application/features/bookingLifecycle/common/notifyOnce.js';
import type { Language } from '../../../../../src/domain/i18n/language.js';
import { FakeUserLanguages } from '../../../../fakes/fakeUserLanguages.js';
import { offerHarness } from '../notifications/offerHarness.js';

/** A notice whose title says which language it was built in. */
const inLanguage = (language: Language) => ({ title: language, body: 'B', data: { type: 'request.complete', requestId: 'r-1' } });

describe('notifyOnce (feature 019)', () => {
  it('writes the inbox entry and pushes once per dedupe key', async () => {
    const h = offerHarness();
    await h.phone('client-a');
    let n = 0;
    const deps = { notifications: h.notifications, pushNotifier: h.pushNotifier, idGenerator: { newId: () => `id-${++n}` }, clock: h.clock, userLanguages: h.userLanguages };
    const message = () => ({ title: 'T', body: 'B', data: { type: 'request.complete', requestId: 'r-1' } });

    expect(await notifyOnce(deps, { userId: 'client-a', message, dedupeKey: 'k-1' })).toBe(1);
    expect(await notifyOnce(deps, { userId: 'client-a', message, dedupeKey: 'k-1' })).toBeNull();

    expect(h.notifications.all()).toMatchObject([{ userId: 'client-a', type: 'request.complete', dedupeKey: 'k-1', data: message().data }]);
    expect(h.pushSender.calls).toHaveLength(1);
  });

  it('keeps the inbox entry for a user without devices', async () => {
    const h = offerHarness();
    const deps = { notifications: h.notifications, pushNotifier: h.pushNotifier, idGenerator: { newId: () => 'id-1' }, clock: h.clock, userLanguages: h.userLanguages };

    expect(await notifyOnce(deps, { userId: 'nobody', message: () => ({ title: 'T', body: 'B', data: { type: 'x' } }), dedupeKey: 'k' })).toBe(0);
    expect(h.notifications.all()).toHaveLength(1);
  });

  it("builds the notice in the recipient's language, then the request's, then Spanish (feature 032)", async () => {
    const h = offerHarness();
    await h.phone('client-en');
    await h.phone('client-none');
    let n = 0;
    const deps = {
      notifications: h.notifications,
      pushNotifier: h.pushNotifier,
      idGenerator: { newId: () => `id-${++n}` },
      clock: h.clock,
      userLanguages: new FakeUserLanguages({ 'client-en': 'en' }),
    };

    await notifyOnce(deps, { userId: 'client-en', message: inLanguage, dedupeKey: 'k-1', requestLanguage: 'es' });
    await notifyOnce(deps, { userId: 'client-none', message: inLanguage, dedupeKey: 'k-2', requestLanguage: 'en' });
    await notifyOnce(deps, { userId: 'client-none', message: inLanguage, dedupeKey: 'k-3' });

    expect(h.notifications.all().map((entry) => [entry.dedupeKey, entry.title])).toEqual([
      ['k-1', 'en'],
      ['k-2', 'en'],
      ['k-3', 'es'],
    ]);
    expect(h.pushSender.calls.map((call) => [call.userId, call.message.title])).toEqual([
      ['client-en', 'en'],
      ['client-none', 'en'],
      ['client-none', 'es'],
    ]);
  });
});
