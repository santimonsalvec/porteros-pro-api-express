import { describe, expect, it } from 'vitest';
import { offerHarness } from './offerHarness.js';

describe('offers in each goalkeeper\'s language (feature 032)', () => {
  it('builds the entry and the push per goalkeeper, reading the languages once per send', async () => {
    const h = offerHarness();
    h.goalkeeper('g-en');
    h.goalkeeper('g-none');
    await h.phone('g-en');
    await h.phone('g-none');
    h.userLanguages.set('g-en', 'en');
    const { bookings } = h.match('r-1');

    await h.sender.send(
      new Map([
        ['g-en', bookings],
        ['g-none', bookings],
      ]),
      h.clock.now(),
      'first',
    );

    expect(h.userLanguages.reads).toEqual([['g-en', 'g-none']]);
    expect(h.notifications.all().map((entry) => [entry.userId, entry.title])).toEqual([
      ['g-en', 'Match available'],
      ['g-none', 'Partido disponible'],
    ]);
    expect(h.pushSender.calls.map((call) => [call.userId, call.message.title]).sort()).toEqual([
      ['g-en', 'Match available'],
      ['g-none', 'Partido disponible'],
    ]);
  });

  it('groups several offers in the goalkeeper\'s language', async () => {
    const h = offerHarness();
    h.goalkeeper('g-en');
    await h.phone('g-en');
    h.userLanguages.set('g-en', 'en');
    const matches = [h.match('r-1', 3), h.match('r-2', 6)];

    await h.sender.send(new Map([['g-en', matches.flatMap((match) => match.bookings)]]), h.clock.now(), 'first');

    expect(h.pushSender.calls.map((call) => call.message.body)).toEqual(['There are 2 matches available in your zones']);
  });
});
