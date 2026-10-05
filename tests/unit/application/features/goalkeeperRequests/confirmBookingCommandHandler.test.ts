import { beforeEach, describe, expect, it } from 'vitest';
import { v7 as uuidv7 } from 'uuid';
import { Booking } from '../../../../../src/domain/bookings/booking.js';
import { GoalkeeperRequest } from '../../../../../src/domain/bookings/goalkeeperRequest.js';
import { ConfirmBookingCommand } from '../../../../../src/application/features/goalkeeperRequests/commands/confirmBooking/confirmBookingCommand.js';
import { ConfirmBookingCommandHandler } from '../../../../../src/application/features/goalkeeperRequests/commands/confirmBooking/confirmBookingCommandHandler.js';
import { FakeBookingAuditLogger } from '../../../../fakes/fakeBookingAuditLogger.js';
import { FakeBookingRepository } from '../../../../fakes/fakeBookingRepository.js';
import { FakeGoalkeeperRequestRepository } from '../../../../fakes/fakeGoalkeeperRequestRepository.js';
import { FixedClock } from '../../../../fakes/fakeClock.js';
import { FakeQuoteConfirmationStore } from '../../../../fakes/fakeQuoteConfirmationStore.js';
import { FakeQuoteRepository } from '../../../../fakes/fakeQuoteRepository.js';
import { FakeOutboxStore } from '../../../../fakes/fakeOutboxStore.js';
import { FakeEventRelay } from '../../../../fakes/fakeEventRelay.js';
import { FakeUserRepository } from '../../../../fakes/fakeUserRepository.js';
import { User } from '../../../../../src/domain/users/user.js';
import {
  buildRequest,
  buildStoredQuote,
  QUOTE_NOW,
  STORED_QUOTE_ID,
} from '../../../../fixtures/quoteFixtures.js';

/** The stored quote is issued at QUOTE_NOW (18:00Z) and expires at 18:03Z. */
class Harness {
  readonly quotes = new FakeQuoteRepository();
  readonly requests = new FakeGoalkeeperRequestRepository();
  readonly bookings = new FakeBookingRepository();
  readonly outbox = new FakeOutboxStore();
  readonly relay = new FakeEventRelay();
  readonly store = new FakeQuoteConfirmationStore(this.quotes, this.requests, this.bookings, this.outbox);
  readonly audit = new FakeBookingAuditLogger();
  readonly users = new FakeUserRepository();
  readonly clock = new FixedClock('2026-09-21T18:01:00.000Z');
  private counter = 0;
  // Ids in creation order: the request is `id-1`, its bookings `id-2` and `id-3`.
  readonly handler = new ConfirmBookingCommandHandler(
    this.requests,
    this.bookings,
    this.users,
    this.quotes,
    this.store,
    { newId: () => `id-${++this.counter}` },
    this.clock,
    this.audit,
    this.relay,
  );

  confirm(quoteId = STORED_QUOTE_ID, clientId = 'client-a', partialFulfillment?: 'keep_confirmed' | 'cancel_all') {
    return this.handler.handle(new ConfirmBookingCommand(clientId, quoteId, partialFulfillment));
  }
}

let h: Harness;
beforeEach(() => {
  h = new Harness();
  h.quotes.seed(buildStoredQuote());
});

describe('ConfirmBookingCommandHandler — Story 1: book at exactly the quoted price', () => {
  it('creates a request that copies the quote, with its bookings, and deletes the quote', async () => {
    const result = await h.confirm();

    expect(result).toEqual({
      outcome: 'created',
      request: {
        requestId: 'id-1',
        quoteId: STORED_QUOTE_ID,
        status: 'searching',
        partialFulfillment: 'keep_confirmed',
        latitude: 3.45,
        longitude: -76.5,
        zoneId: 'zone-cali-norte',
        cityId: 'city-cali',
        startsAt: '2026-09-21T20:00:00.000Z',
        startsAtLocal: '2026-09-21T15:00:00-05:00',
        timeZone: 'America/Bogota',
        goalkeeperCount: 2,
        durationMinutes: 90,
        matchFormat: null,
        unitRate: 55000,
        subtotal: 110000,
        unitSurcharge: 5000,
        surcharge: 10000,
        total: 120000,
        currency: 'COP',
        cancellation: { freeCancellationUntil: '2026-09-21T19:00:00.000Z', freeCancellationAvailable: true },
        contactsVisibleFrom: '2026-09-21T19:00:00.000Z',
        createdAt: '2026-09-21T18:01:00.000Z',
        bookings: ['id-2', 'id-3'].map((bookingId) => ({
          bookingId,
          status: 'pending_assignment',
          unitRate: 55000,
          unitSurcharge: 5000,
          total: 60000,
          currency: 'COP',
          createdAt: '2026-09-21T18:01:00.000Z',
          goalkeeper: null,
          assignedAt: null,
          checkIn: null,
        })),
      },
    });
    expect(h.quotes.all()).toHaveLength(0);
    expect(h.requests.all()).toHaveLength(1);
    expect(h.requests.all()[0]!.quoteIssuedAt).toEqual(new Date(QUOTE_NOW));
    expect(h.bookings.all()).toHaveLength(2);
  });

  it('books the stored price even though nothing is re-priced (the handler reads no rate or setting)', async () => {
    // The handler has no rate/settings dependency at all: whatever the rates are now, the
    // booked amounts can only come from the stored quote.
    const result = await h.confirm();

    expect(result).toMatchObject({
      outcome: 'created',
      request: { unitRate: 55000, total: 120000, currency: 'COP' },
    });
  });

  it('audits the creation once, with the request and booking ids', async () => {
    await h.confirm();

    expect(h.audit.entries).toEqual([
      {
        outcome: 'created',
        clientId: 'client-a',
        quoteId: STORED_QUOTE_ID,
        requestId: 'id-1',
        bookingIds: ['id-2', 'id-3'],
      },
    ]);
  });

  it('books any other valid quote id the client holds', async () => {
    const otherId = uuidv7();
    h.quotes.seed(buildStoredQuote({ id: otherId, startsAt: '2026-09-21T21:00:00.000Z' }));

    expect(await h.confirm(otherId)).toMatchObject({
      outcome: 'created',
      request: { quoteId: otherId },
    });
  });
});

describe('ConfirmBookingCommandHandler — US1: one request and one booking per goalkeeper', () => {
  it('splits a 2-goalkeeper quote into 2 bookings whose prices add up to the quoted total', async () => {
    const result = await h.confirm();

    if (result.outcome !== 'created') throw new Error('expected a created request');
    expect(result.request.bookings).toHaveLength(2);
    for (const booking of result.request.bookings) {
      expect(booking).toMatchObject({ unitRate: 55000, unitSurcharge: 5000, total: 60000, currency: 'COP' });
    }
    expect(result.request.bookings.reduce((sum, booking) => sum + booking.total, 0)).toBe(result.request.total);
    expect(h.bookings.all().every((booking) => booking.requestId === 'id-1')).toBe(true);
  });

  it('creates exactly one booking for a 1-goalkeeper quote', async () => {
    const soloId = uuidv7();
    h.quotes.seed(buildStoredQuote({ id: soloId, goalkeeperCount: 1, startsAt: '2026-09-21T21:00:00.000Z' }));

    const result = await h.confirm(soloId);

    expect(result).toMatchObject({ outcome: 'created', request: { goalkeeperCount: 1, total: 60000 } });
    expect(result.outcome === 'created' && result.request.bookings).toHaveLength(1);
  });

  it('leaves nothing behind when the transaction is interrupted, and the quote is still confirmable', async () => {
    h.store.failNextWith(new Error('connection reset'));

    await expect(h.confirm()).rejects.toThrow('connection reset');

    expect(h.requests.all()).toHaveLength(0);
    expect(h.bookings.all()).toHaveLength(0);
    expect(h.quotes.all()).toHaveLength(1);
    expect(await h.confirm()).toMatchObject({ outcome: 'created' });
  });
});

describe('ConfirmBookingCommandHandler — Story 2: retries never create a second request', () => {
  it('returns the same request on a retry, without opening another transaction', async () => {
    const first = await h.confirm();
    const second = await h.confirm();

    expect(second).toEqual({ ...first, outcome: 'replayed' });
    expect(h.store.calls).toBe(1);
    expect(h.requests.all()).toHaveLength(1);
    expect(h.bookings.all()).toHaveLength(2);
  });

  it('still returns the request when retried long after the quote expired', async () => {
    const first = await h.confirm();
    h.clock.advance(2 * 24 * 60 * 60 * 1000);

    const retry = await h.confirm();

    // Same request and bookings; only the free-cancellation answer reflects the later "now".
    if (first.outcome !== 'created') throw new Error('expected the first confirmation to create');
    expect(retry).toEqual({
      outcome: 'replayed',
      request: { ...first.request, cancellation: { ...first.request.cancellation, freeCancellationAvailable: false } },
    });
  });

  it("returns the winner's request when a concurrent confirmation committed first", async () => {
    // Simulate the race: between the replay lookup and the claim, another confirmation created the request.
    const quote = h.quotes.all()[0]!;
    const winner = GoalkeeperRequest.fromQuote('request-winner', quote, 'keep_confirmed', h.clock.now());
    const lookup = h.requests.findByQuoteForClient.bind(h.requests);
    let lookups = 0;
    h.requests.findByQuoteForClient = async (quoteId, clientId) => {
      lookups += 1;
      if (lookups === 2) {
        // committed while we were claiming
        h.requests.seed(winner);
        h.bookings.seed(Booking.forRequest('booking-winner-1', winner, h.clock.now()));
        h.bookings.seed(Booking.forRequest('booking-winner-2', winner, h.clock.now()));
      }
      return lookup(quoteId, clientId);
    };
    h.store.failNextWith({ kind: 'already_requested' });

    const result = await h.confirm();

    expect(result).toMatchObject({ outcome: 'replayed', request: { requestId: 'request-winner' } });
    expect(result.outcome === 'replayed' && result.request.bookings.map((booking) => booking.bookingId)).toEqual([
      'booking-winner-1',
      'booking-winner-2',
    ]);
    expect(h.requests.all()).toHaveLength(1);
  });

  it('answers confirmation_in_progress when a valid quote could not be claimed and no request exists yet', async () => {
    h.store.failNextWith({ kind: 'not_claimed' });

    const result = await h.confirm();

    expect(result).toEqual({ outcome: 'confirmation_in_progress' });
    expect(h.requests.all()).toHaveLength(0);
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
    expect(h.audit.entries[1]).toMatchObject({ requestId: 'id-1', bookingIds: ['id-2', 'id-3'] });
  });
});

describe('ConfirmBookingCommandHandler — US2: a replay shows the bookings as they are now', () => {
  it('returns the current state of each booking, and the derived status follows it', async () => {
    await h.confirm();
    const [first] = h.bookings.all();
    h.bookings.seed(Booking.rehydrate({ ...first!, status: 'assigned' }));

    const replay = await h.confirm();

    expect(replay).toMatchObject({ outcome: 'replayed', request: { status: 'partially_assigned' } });
    expect(replay.outcome === 'replayed' && replay.request.bookings.map((booking) => booking.status)).toEqual([
      'assigned',
      'pending_assignment',
    ]);
    expect(h.store.calls).toBe(1);
  });

  it('shows the contact of the goalkeeper who has taken a booking since (012 US5)', async () => {
    const user = User.createFromExternalIdentity({ id: 'gk-1', email: 'gk-1@example.com', displayName: null, provider: 'google', subject: 'gk-1' });
    user.completeProfile('Camilo', 'Portero', '+57', '3001234567');
    h.users.seed(user);
    await h.confirm();
    const [first] = h.bookings.all();
    const assignedAt = h.clock.now();
    h.bookings.seed(first!.assign('gk-1', assignedAt));

    const early = await h.confirm();
    expect(early.outcome === 'replayed' && early.request.bookings[0]).toMatchObject({ goalkeeper: null }); // feature 019
    h.clock.set('2026-09-21T19:00:00.000Z');

    const replay = await h.confirm();

    expect(replay.outcome === 'replayed' && replay.request.bookings).toEqual([
      expect.objectContaining({
        goalkeeper: { firstName: 'Camilo', lastName: 'Portero', whatsApp: '+57 3001234567' },
        assignedAt: assignedAt.toISOString(),
      }),
      expect.objectContaining({ goalkeeper: null, assignedAt: null }),
    ]);
  });
});

describe('ConfirmBookingCommandHandler — US3: partial-confirmation preference', () => {
  it('stores keep_confirmed when no preference is given', async () => {
    await h.confirm();

    expect(h.requests.all()[0]!.partialFulfillment).toBe('keep_confirmed');
  });

  it('stores cancel_all when the client chooses it', async () => {
    const result = await h.confirm(STORED_QUOTE_ID, 'client-a', 'cancel_all');

    expect(result).toMatchObject({ outcome: 'created', request: { partialFulfillment: 'cancel_all' } });
    expect(h.requests.all()[0]!.partialFulfillment).toBe('cancel_all');
  });

  it('accepts either value for a 1-goalkeeper quote', async () => {
    const soloId = uuidv7();
    h.quotes.seed(buildStoredQuote({ id: soloId, goalkeeperCount: 1, startsAt: '2026-09-21T21:00:00.000Z' }));

    expect(await h.confirm(soloId, 'client-a', 'cancel_all')).toMatchObject({
      outcome: 'created',
      request: { partialFulfillment: 'cancel_all', goalkeeperCount: 1 },
    });
  });

  it('never changes the stored preference on a replay', async () => {
    await h.confirm(STORED_QUOTE_ID, 'client-a', 'keep_confirmed');

    const replay = await h.confirm(STORED_QUOTE_ID, 'client-a', 'cancel_all');

    expect(replay).toMatchObject({ outcome: 'replayed', request: { partialFulfillment: 'keep_confirmed' } });
    expect(h.requests.all()[0]!.partialFulfillment).toBe('keep_confirmed');
  });
});

describe('ConfirmBookingCommandHandler — US4: one active request per match', () => {
  it('lets a new request reuse the zone and start of an ended (inactive) request', async () => {
    h.requests.seed(buildRequest('old-request', new Date('2026-09-21T20:00:00.000Z'), { active: false }));

    expect(await h.confirm()).toMatchObject({ outcome: 'created' });
    expect(h.requests.all()).toHaveLength(2);
  });

  it('never refuses the bookings of one request against each other', async () => {
    const result = await h.confirm();

    expect(result.outcome).toBe('created');
    expect(h.bookings.all().map((booking) => booking.requestId)).toEqual(['id-1', 'id-1']);
  });
});

describe('ConfirmBookingCommandHandler — US6: late-confirmation notice', () => {
  // The clock reads 18:01Z; each quote below uses a 60-minute free-cancellation period.
  const confirmStartingAt = async (startsAt: string) => {
    const id = uuidv7();
    h.quotes.seed(buildStoredQuote({ id, startsAt, freeCancellationMinutes: 60 }));
    const result = await h.confirm(id);
    if (result.outcome !== 'created') throw new Error(`expected created, got ${result.outcome}`);
    return result.request.cancellation;
  };

  it('says free cancellation is over when the match starts inside the period (45 min away)', async () => {
    expect(await confirmStartingAt('2026-09-21T18:46:00.000Z')).toEqual({
      freeCancellationUntil: '2026-09-21T17:46:00.000Z',
      freeCancellationAvailable: false,
    });
  });

  it('says until when it is free when the match is 3 hours away', async () => {
    expect(await confirmStartingAt('2026-09-21T21:01:00.000Z')).toEqual({
      freeCancellationUntil: '2026-09-21T20:01:00.000Z',
      freeCancellationAvailable: true,
    });
  });

  it('is still free exactly at the boundary (the match starts exactly 60 minutes after confirming)', async () => {
    expect((await confirmStartingAt('2026-09-21T19:01:00.000Z')).freeCancellationAvailable).toBe(true);
  });

  it("keeps the quote's period on the request instead of re-reading settings", async () => {
    const id = uuidv7();
    h.quotes.seed(buildStoredQuote({ id, freeCancellationMinutes: 45, startsAt: '2026-09-21T21:00:00.000Z' }));

    await h.confirm(id);

    expect(h.requests.all()[0]!.freeCancellationMinutes).toBe(45);
  });
});

describe('ConfirmBookingCommandHandler — Story 4: stale, foreign or unknown quotes are refused', () => {
  it('refuses an expired quote that is still stored, leaving it untouched', async () => {
    h.clock.set('2026-09-21T18:04:00.000Z'); // issued 18:00, expired 18:03

    const result = await h.confirm();

    expect(result).toEqual({ outcome: 'quote_expired' });
    expect(h.quotes.all()).toHaveLength(1);
    expect(h.requests.all()).toHaveLength(0);
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
    expect(h.requests.all()).toHaveLength(0);
  });

  it('answers quote_not_found to a malformed id without touching any repository', async () => {
    const result = await h.confirm('not-a-uuid');

    expect(result).toEqual({ outcome: 'quote_not_found' });
    expect(h.store.calls).toBe(0);
  });

  it('refuses a second quote for a match the client already requested, pointing at the existing request', async () => {
    await h.confirm(); // requests zone Cali Norte at 20:00Z as id-1
    const secondId = uuidv7();
    h.quotes.seed(buildStoredQuote({ id: secondId }));

    const result = await h.confirm(secondId);

    expect(result).toEqual({ outcome: 'duplicate_request', existingRequestId: 'id-1' });
    expect(h.requests.all()).toHaveLength(1);
    expect(h.bookings.all()).toHaveLength(2);
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
    expect(h.requests.all()).toHaveLength(3);
  });

  it('audits every refusal once, without request or booking ids', async () => {
    h.clock.set('2026-09-21T18:04:00.000Z');
    await h.confirm();
    await h.confirm('not-a-uuid');

    expect(h.audit.entries).toEqual([
      { outcome: 'quote_expired', clientId: 'client-a', quoteId: STORED_QUOTE_ID },
      { outcome: 'quote_not_found', clientId: 'client-a', quoteId: 'not-a-uuid' },
    ]);
  });
});

describe('ConfirmBookingCommandHandler — 013 US1: a confirmation records one event per booking', () => {
  const events = () => h.outbox.all().map((entry) => entry.event);

  it('records a booking.created for each booking, naming it and its request', async () => {
    await h.confirm();

    expect(events()).toEqual([
      expect.objectContaining({ type: 'booking.created', bookingId: 'id-2', requestId: 'id-1', occurredAt: h.clock.now() }),
      expect.objectContaining({ type: 'booking.created', bookingId: 'id-3', requestId: 'id-1' }),
    ]);
    expect(events()[0]!.payload).toMatchObject({ clientId: 'client-a', zoneId: 'zone-cali-norte', commission: 7000, currency: 'COP', goalkeeperCount: 2 });
    expect(new Set(events().map((event) => event.id)).size).toBe(2);
  });

  it('records nothing on a replay, and relays only the created events (013 US2)', async () => {
    await h.confirm();
    await h.confirm();

    expect(events()).toHaveLength(2);
    expect(h.relay.calls).toEqual([events()]);
  });

  it('records nothing when the confirmation is refused', async () => {
    h.clock.set('2026-09-21T18:05:00.000Z'); // the quote expired at 18:03

    expect((await h.confirm()).outcome).toBe('quote_expired');
    expect(events()).toHaveLength(0);
  });
});

describe('ConfirmBookingCommandHandler — feature 016: "cancel all" only while it can be applied', () => {
  it('refuses "cancel all" once the free-cancellation period started, claiming nothing', async () => {
    h.quotes.seed(buildStoredQuote({ freeCancellationMinutes: 150 })); // until 17:30Z; now 18:01Z

    const result = await h.confirm(STORED_QUOTE_ID, 'client-a', 'cancel_all');

    expect(result).toEqual({ outcome: 'cancel_all_not_available', cancelAllUntil: '2026-09-21T17:30:00.000Z' });
    expect(h.requests.all()).toHaveLength(0);
    expect(await h.quotes.findByIdForClient(STORED_QUOTE_ID, 'client-a')).not.toBeNull();
    expect(h.audit.entries.at(-1)).toMatchObject({ outcome: 'cancel_all_not_available' });
  });

  it('accepts the same late quote with "keep the confirmed goalkeepers"', async () => {
    h.quotes.seed(buildStoredQuote({ freeCancellationMinutes: 150 }));

    expect(await h.confirm(STORED_QUOTE_ID, 'client-a', 'keep_confirmed')).toMatchObject({ outcome: 'created' });
  });

  it('accepts "cancel all" before the period starts, and still answers a replay afterwards', async () => {
    expect(await h.confirm(STORED_QUOTE_ID, 'client-a', 'cancel_all')).toMatchObject({ outcome: 'created', request: { partialFulfillment: 'cancel_all' } });

    h.clock.set('2026-09-21T19:30:00.000Z');
    expect(await h.confirm(STORED_QUOTE_ID, 'client-a', 'cancel_all')).toMatchObject({ outcome: 'replayed' });
  });
});
