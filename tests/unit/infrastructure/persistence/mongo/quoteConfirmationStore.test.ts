import { describe, expect, it, vi } from 'vitest';
import type { ClientSession, Collection, Db, Document } from 'mongodb';
import { Booking } from '../../../../../src/domain/bookings/booking.js';
import type { Quote } from '../../../../../src/domain/bookings/quote.js';
import { bookingToDocument } from '../../../../../src/infrastructure/persistence/mongo/bookingRepository.js';
import { MongoQuoteConfirmationStore } from '../../../../../src/infrastructure/persistence/mongo/quoteConfirmationStore.js';
import { quoteToDocument } from '../../../../../src/infrastructure/persistence/mongo/quoteRepository.js';
import { createFakeCollection } from '../../../../fakes/fakeMongoCollection.js';
import { buildStoredQuote, STORED_QUOTE_ID } from '../../../../fixtures/quoteFixtures.js';

const now = new Date('2026-09-21T18:01:00.000Z');

function harness() {
  const quotes = createFakeCollection();
  const bookings = createFakeCollection();
  const db = {
    collection: (name: string) =>
      (name === 'quotes' ? quotes : bookings) as unknown as Collection<Document>,
  } as unknown as Db;
  // Runs the callback once, as the driver does when nothing is transient.
  const session = {
    withTransaction: vi.fn(async (fn: (s: ClientSession) => Promise<unknown>, _options?: unknown) =>
      fn(session as unknown as ClientSession),
    ),
    endSession: vi.fn(async () => undefined),
  };
  const store = new MongoQuoteConfirmationStore(() => session as unknown as ClientSession, db);
  const newBooking = (quote: Quote) => Booking.fromQuote('b-1', quote, now);
  return { quotes, bookings, session, store, newBooking };
}

function duplicateKeyError(keyPattern: Record<string, number>) {
  return Object.assign(new Error('E11000 duplicate key error'), { code: 11000, keyPattern });
}

describe('MongoQuoteConfirmationStore (mocked driver)', () => {
  it("claims only the caller's unexpired quote, inside the transaction", async () => {
    const { quotes, bookings, session, store, newBooking } = harness();
    quotes.findOneAndDelete.mockResolvedValue(quoteToDocument(buildStoredQuote()));
    bookings.insertOne.mockResolvedValue({});

    await store.claimAndBook(STORED_QUOTE_ID, 'client-a', now, newBooking);

    expect(quotes.findOneAndDelete).toHaveBeenCalledWith(
      { _id: STORED_QUOTE_ID, clientId: 'client-a', expiresAt: { $gt: now } },
      { session },
    );
    expect(bookings.insertOne.mock.calls[0]![1]).toEqual({ session });
  });

  it('inserts the booking built from the deleted quote and reports it booked', async () => {
    const { quotes, bookings, store, newBooking } = harness();
    const quote = buildStoredQuote();
    quotes.findOneAndDelete.mockResolvedValue(quoteToDocument(quote));
    bookings.insertOne.mockResolvedValue({});

    const result = await store.claimAndBook(STORED_QUOTE_ID, 'client-a', now, newBooking);

    const expected = Booking.fromQuote('b-1', quote, now);
    expect(bookings.insertOne.mock.calls[0]![0]).toEqual(bookingToDocument(expected));
    expect(result).toEqual({ kind: 'booked', booking: expected });
  });

  it('writes nothing when there is no claimable quote', async () => {
    const { quotes, bookings, store, newBooking } = harness();
    quotes.findOneAndDelete.mockResolvedValue(null);

    const result = await store.claimAndBook(STORED_QUOTE_ID, 'client-a', now, newBooking);

    expect(result).toEqual({ kind: 'not_claimed' });
    expect(bookings.insertOne).not.toHaveBeenCalled();
  });

  it('reports already_booked when the quote already has a booking (quoteId index)', async () => {
    const { quotes, bookings, store, newBooking } = harness();
    quotes.findOneAndDelete.mockResolvedValue(quoteToDocument(buildStoredQuote()));
    bookings.insertOne.mockRejectedValue(duplicateKeyError({ quoteId: 1 }));

    expect(await store.claimAndBook(STORED_QUOTE_ID, 'client-a', now, newBooking)).toEqual({
      kind: 'already_booked',
    });
  });

  it('reports duplicate_booking with the zone and start when the client already booked that match', async () => {
    const { quotes, bookings, store, newBooking } = harness();
    quotes.findOneAndDelete.mockResolvedValue(quoteToDocument(buildStoredQuote()));
    bookings.insertOne.mockRejectedValue(
      duplicateKeyError({ clientId: 1, zoneId: 1, startsAt: 1 }),
    );

    expect(await store.claimAndBook(STORED_QUOTE_ID, 'client-a', now, newBooking)).toEqual({
      kind: 'duplicate_booking',
      zoneId: 'zone-cali-norte',
      startsAt: new Date('2026-09-21T20:00:00.000Z'),
    });
  });

  it('rethrows any other failure', async () => {
    const { quotes, store, newBooking } = harness();
    quotes.findOneAndDelete.mockRejectedValue(new Error('network down'));

    await expect(store.claimAndBook(STORED_QUOTE_ID, 'client-a', now, newBooking)).rejects.toThrow(
      'network down',
    );
  });

  it('always ends the session', async () => {
    const ok = harness();
    ok.quotes.findOneAndDelete.mockResolvedValue(null);
    await ok.store.claimAndBook(STORED_QUOTE_ID, 'client-a', now, ok.newBooking);
    expect(ok.session.endSession).toHaveBeenCalledTimes(1);

    const failing = harness();
    failing.quotes.findOneAndDelete.mockRejectedValue(new Error('boom'));
    await expect(
      failing.store.claimAndBook(STORED_QUOTE_ID, 'client-a', now, failing.newBooking),
    ).rejects.toThrow();
    expect(failing.session.endSession).toHaveBeenCalledTimes(1);
  });

  it('commits with majority write concern on the primary, reading a snapshot', async () => {
    const { quotes, session, store, newBooking } = harness();
    quotes.findOneAndDelete.mockResolvedValue(null);

    await store.claimAndBook(STORED_QUOTE_ID, 'client-a', now, newBooking);

    expect(session.withTransaction.mock.calls[0]![1]).toEqual({
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' },
      readPreference: 'primary',
    });
  });
});
