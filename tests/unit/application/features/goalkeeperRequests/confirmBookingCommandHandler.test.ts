import { beforeEach, describe, expect, it } from 'vitest';
import { v7 as uuidv7 } from 'uuid';
import { Booking } from '../../../../../src/domain/bookings/booking.js';
import { ConfirmBookingCommand } from '../../../../../src/application/features/goalkeeperRequests/commands/confirmBooking/confirmBookingCommand.js';
import { ConfirmBookingCommandHandler } from '../../../../../src/application/features/goalkeeperRequests/commands/confirmBooking/confirmBookingCommandHandler.js';
import { FakeBookingAuditLogger } from '../../../../fakes/fakeBookingAuditLogger.js';
import { FakeBookingRepository } from '../../../../fakes/fakeBookingRepository.js';
import { FixedClock } from '../../../../fakes/fakeClock.js';
import { FakeQuoteConfirmationStore } from '../../../../fakes/fakeQuoteConfirmationStore.js';
import { FakeQuoteRepository } from '../../../../fakes/fakeQuoteRepository.js';
import {
  buildStoredQuote,
  QUOTE_NOW,
  STORED_QUOTE_ID,
} from '../../../../fixtures/quoteFixtures.js';

/** The stored quote is issued at QUOTE_NOW (18:00Z) and expires at 18:03Z. */
class Harness {
  readonly quotes = new FakeQuoteRepository();
  readonly bookings = new FakeBookingRepository();
  readonly store = new FakeQuoteConfirmationStore(this.quotes, this.bookings);
  readonly audit = new FakeBookingAuditLogger();
  readonly clock = new FixedClock('2026-09-21T18:01:00.000Z');
  private counter = 0;
  readonly handler = new ConfirmBookingCommandHandler(
    this.bookings,
    this.quotes,
    this.store,
    { newId: () => `booking-${++this.counter}` },
    this.clock,
    this.audit,
  );

  confirm(quoteId = STORED_QUOTE_ID, clientId = 'client-a') {
    return this.handler.handle(new ConfirmBookingCommand(clientId, quoteId));
  }
}

let h: Harness;
beforeEach(() => {
  h = new Harness();
  h.quotes.seed(buildStoredQuote());
});

describe('ConfirmBookingCommandHandler — Story 1: book at exactly the quoted price', () => {
  it('creates a booking that copies the quote and deletes the quote', async () => {
    const result = await h.confirm();

    expect(result).toEqual({
      outcome: 'created',
      booking: {
        bookingId: 'booking-1',
        quoteId: STORED_QUOTE_ID,
        status: 'pending_assignment',
        latitude: 3.45,
        longitude: -76.5,
        zoneId: 'zone-cali-norte',
        cityId: 'city-cali',
        startsAt: '2026-09-21T20:00:00.000Z',
        startsAtLocal: '2026-09-21T15:00:00-05:00',
        timeZone: 'America/Bogota',
        goalkeeperCount: 2,
        durationMinutes: 90,
        unitRate: 55000,
        subtotal: 110000,
        unitSurcharge: 5000,
        surcharge: 10000,
        total: 120000,
        currency: 'COP',
        createdAt: '2026-09-21T18:01:00.000Z',
      },
    });
    expect(h.quotes.all()).toHaveLength(0);
    expect(h.bookings.all()).toHaveLength(1);
    expect(h.bookings.all()[0]!.quoteIssuedAt).toEqual(new Date(QUOTE_NOW));
  });

  it('books the stored price even though nothing is re-priced (the handler reads no rate or setting)', async () => {
    // The handler has no rate/settings dependency at all: whatever the rates are now, the
    // booked amounts can only come from the stored quote.
    const result = await h.confirm();

    expect(result).toMatchObject({
      outcome: 'created',
      booking: { unitRate: 55000, total: 120000, currency: 'COP' },
    });
  });

  it('audits the creation once, with the booking id', async () => {
    await h.confirm();

    expect(h.audit.entries).toEqual([
      {
        outcome: 'created',
        clientId: 'client-a',
        quoteId: STORED_QUOTE_ID,
        bookingId: 'booking-1',
      },
    ]);
  });

  it('books any other valid quote id the client holds', async () => {
    const otherId = uuidv7();
    h.quotes.seed(buildStoredQuote({ id: otherId, startsAt: '2026-09-21T21:00:00.000Z' }));

    expect(await h.confirm(otherId)).toMatchObject({
      outcome: 'created',
      booking: { quoteId: otherId },
    });
  });
});

describe('ConfirmBookingCommandHandler — Story 2: retries never create a second booking', () => {
  it('returns the same booking on a retry, without opening another transaction', async () => {
    const first = await h.confirm();
    const second = await h.confirm();

    expect(second).toEqual({ ...first, outcome: 'replayed' });
    expect(h.store.calls).toBe(1);
    expect(h.bookings.all()).toHaveLength(1);
  });

  it('still returns the booking when retried long after the quote expired', async () => {
    const first = await h.confirm();
    h.clock.advance(2 * 24 * 60 * 60 * 1000);

    const retry = await h.confirm();

    expect(retry).toMatchObject({ outcome: 'replayed' });
    expect(retry).toEqual({ ...first, outcome: 'replayed' });
  });

  it("returns the winner's booking when a concurrent confirmation committed first", async () => {
    // Simulate the race: between the replay lookup and the claim, another request booked the quote.
    const quote = h.quotes.all()[0]!;
    const winner = Booking.fromQuote('booking-winner', quote, h.clock.now());
    const lookup = h.bookings.findByQuoteForClient.bind(h.bookings);
    let lookups = 0;
    h.bookings.findByQuoteForClient = async (quoteId, clientId) => {
      lookups += 1;
      if (lookups === 2) h.bookings.seed(winner); // committed while we were claiming
      return lookup(quoteId, clientId);
    };
    h.store.failNextWith({ kind: 'already_booked' });

    const result = await h.confirm();

    expect(result).toMatchObject({ outcome: 'replayed', booking: { bookingId: 'booking-winner' } });
    expect(h.bookings.all()).toHaveLength(1);
  });

  it('answers confirmation_in_progress when a valid quote could not be claimed and no booking exists yet', async () => {
    h.store.failNextWith({ kind: 'not_claimed' });

    const result = await h.confirm();

    expect(result).toEqual({ outcome: 'confirmation_in_progress' });
    expect(h.bookings.all()).toHaveLength(0);
    expect(h.quotes.all()).toHaveLength(1);
  });

  it('audits replays and in-progress answers', async () => {
    await h.confirm();
    await h.confirm();
    h.quotes.seed(buildStoredQuote({ id: uuidv7(), startsAt: '2026-09-21T21:00:00.000Z' }));
    const pendingId = h.quotes.all()[0]!.id;
    h.store.failNextWith({ kind: 'not_claimed' });
    await h.confirm(pendingId);

    expect(h.audit.entries.map((entry) => entry.outcome)).toEqual([
      'created',
      'replayed',
      'confirmation_in_progress',
    ]);
    expect(h.audit.entries[1]).toMatchObject({ bookingId: 'booking-1' });
  });
});

describe('ConfirmBookingCommandHandler — Story 4: stale, foreign or unknown quotes are refused', () => {
  it('refuses an expired quote that is still stored, leaving it untouched', async () => {
    h.clock.set('2026-09-21T18:04:00.000Z'); // issued 18:00, expired 18:03

    const result = await h.confirm();

    expect(result).toEqual({ outcome: 'quote_expired' });
    expect(h.quotes.all()).toHaveLength(1);
    expect(h.bookings.all()).toHaveLength(0);
  });

  it('books one second before the expiry and refuses at the expiry instant', async () => {
    h.clock.set('2026-09-21T18:02:59.000Z');
    expect(await h.confirm()).toMatchObject({ outcome: 'created' });

    const late = new Harness();
    late.quotes.seed(buildStoredQuote());
    late.clock.set('2026-09-21T18:03:00.000Z');
    expect(await late.confirm()).toEqual({ outcome: 'quote_expired' });
  });

  it('answers quote_not_found once the database has removed the expired quote', async () => {
    h.quotes.remove(STORED_QUOTE_ID);
    h.clock.set('2026-09-21T18:05:00.000Z');

    expect(await h.confirm()).toEqual({ outcome: 'quote_not_found' });
  });

  it("treats another client's quote exactly like a missing one, and leaves it alone", async () => {
    const result = await h.confirm(STORED_QUOTE_ID, 'client-b');

    expect(result).toEqual({ outcome: 'quote_not_found' });
    expect(h.quotes.all()).toHaveLength(1);
    expect(h.bookings.all()).toHaveLength(0);
  });

  it('answers quote_not_found to a malformed id without touching any repository', async () => {
    const result = await h.confirm('not-a-uuid');

    expect(result).toEqual({ outcome: 'quote_not_found' });
    expect(h.store.calls).toBe(0);
  });

  it('refuses a second quote for a match the client already booked, pointing at the existing booking', async () => {
    await h.confirm(); // books zone Cali Norte at 20:00Z as booking-1
    const secondId = uuidv7();
    h.quotes.seed(buildStoredQuote({ id: secondId }));

    const result = await h.confirm(secondId);

    expect(result).toEqual({ outcome: 'duplicate_booking', existingBookingId: 'booking-1' });
    expect(h.bookings.all()).toHaveLength(1);
    expect(h.quotes.all().map((quote) => quote.id)).toEqual([secondId]); // left to expire
  });

  it('does not treat another zone or another start as a duplicate', async () => {
    await h.confirm();
    const otherZone = uuidv7();
    const otherStart = uuidv7();
    h.quotes.seed(buildStoredQuote({ id: otherZone, zoneId: 'zone-cali-sur' }));
    h.quotes.seed(buildStoredQuote({ id: otherStart, startsAt: '2026-09-21T21:00:00.000Z' }));

    expect(await h.confirm(otherZone)).toMatchObject({ outcome: 'created' });
    expect(await h.confirm(otherStart)).toMatchObject({ outcome: 'created' });
    expect(h.bookings.all()).toHaveLength(3);
  });

  it('audits every refusal once, without a booking id', async () => {
    h.clock.set('2026-09-21T18:04:00.000Z');
    await h.confirm();
    await h.confirm('not-a-uuid');

    expect(h.audit.entries).toEqual([
      { outcome: 'quote_expired', clientId: 'client-a', quoteId: STORED_QUOTE_ID },
      { outcome: 'quote_not_found', clientId: 'client-a', quoteId: 'not-a-uuid' },
    ]);
  });
});
