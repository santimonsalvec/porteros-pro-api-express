import { describe, expect, it } from 'vitest';
import { closeHarness } from '../bookingLifecycle/closeHarness.js';

describe('RateBookingCommand — US2: client and goalkeeper rate each other (feature 021)', () => {
  it('records one private rating per side, and refuses a repeat', async () => {
    const h = await closeHarness();
    await h.close();

    expect(await h.rate(h.booking.id, 'client-a', true, 5, '  Puntual ')).toMatchObject({
      outcome: 'rated',
      rating: { side: 'client', answer: true, stars: 5, comment: 'Puntual' },
    });
    expect(await h.rate(h.booking.id, 'g', true, 4)).toMatchObject({ outcome: 'rated', rating: { side: 'goalkeeper' } });
    expect(await h.rate(h.booking.id, 'client-a', true, 3)).toEqual({ outcome: 'already_rated' });
    expect(h.store.ratings()).toHaveLength(2);
    expect(h.current(h.booking.id).attendance).toBe('attended');
    expect(h.audit.ratings.map((entry) => entry.outcome)).toEqual(['rated', 'rated', 'already_rated']);
  });

  it('opens the client when the goalkeeper checked in, the goalkeeper only once completed', async () => {
    const h = await closeHarness();
    await h.checkInNow();

    expect((await h.rate(h.booking.id, 'g', true)).outcome).toBe('not_rateable');
    expect((await h.rate(h.booking.id, 'client-a', true)).outcome).toBe('rated');

    const other = await closeHarness();
    other.at(-10);
    expect(await other.rate(other.booking.id, 'client-a', true)).toEqual({ outcome: 'not_rateable', reason: 'not_finished' });
  });

  it('refuses strangers, withdrawn bookings, late ratings and invalid values', async () => {
    const h = await closeHarness();
    await h.close();
    expect(await h.rate(h.booking.id, 'stranger', true)).toEqual({ outcome: 'booking_not_found' });
    expect(await h.rate('missing', 'client-a', true)).toEqual({ outcome: 'booking_not_found' });
    expect((await h.rate(h.booking.id, 'client-a', true, 6)).outcome).toBe('invalid_rating');
    expect((await h.rate(h.booking.id, 'client-a', true, 4, 'x'.repeat(501))).outcome).toBe('invalid_rating');
    h.at(7 * 24 * 60 + 1);
    expect(await h.rate(h.booking.id, 'client-a', true)).toEqual({ outcome: 'not_rateable', reason: 'expired' });

    const withdrawn = await closeHarness();
    withdrawn.clock.set(new Date(withdrawn.booking.startsAt.getTime() - 3 * 3_600_000 + 60_000));
    await withdrawn.withdraw(withdrawn.booking.id, 'g');
    await withdrawn.close();
    expect(await withdrawn.rate(withdrawn.booking.id, 'g', true)).toEqual({ outcome: 'not_rateable', reason: 'no_goalkeeper' });
  });

  it('lists pending ratings for both sides until rated or expired', async () => {
    const h = await closeHarness();
    await h.close();

    expect(await h.pending('client-a')).toMatchObject([
      { bookingId: h.booking.id, side: 'client', question: 'goalkeeper_arrived', otherParty: { firstName: 'Juan', lastName: 'Ruiz' }, zoneName: 'Bello' },
    ]);
    expect(await h.pending('g')).toMatchObject([{ bookingId: h.booking.id, side: 'goalkeeper', question: 'payment_received', otherParty: { firstName: 'Ana' } }]);

    await h.rate(h.booking.id, 'client-a', true);
    expect(await h.pending('client-a')).toEqual([]);
    h.at(7 * 24 * 60 + 1);
    expect(await h.pending('g')).toEqual([]);
  });
});
