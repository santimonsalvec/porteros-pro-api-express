import { describe, expect, it, vi } from 'vitest';
import type { ClientSession, Collection, Db, Document } from 'mongodb';
import { Booking } from '../../../../../src/domain/bookings/booking.js';
import { GoalkeeperRequest } from '../../../../../src/domain/bookings/goalkeeperRequest.js';
import type { Quote } from '../../../../../src/domain/bookings/quote.js';
import { bookingToDocument } from '../../../../../src/infrastructure/persistence/mongo/bookingRepository.js';
import { requestToDocument } from '../../../../../src/infrastructure/persistence/mongo/goalkeeperRequestRepository.js';
import { bookingCreated } from '../../../../../src/domain/events/bookingEvents.js';
import { MongoQuoteConfirmationStore } from '../../../../../src/infrastructure/persistence/mongo/quoteConfirmationStore.js';
import { quoteToDocument } from '../../../../../src/infrastructure/persistence/mongo/quoteRepository.js';
import { createFakeCollection } from '../../../../fakes/fakeMongoCollection.js';
import { buildStoredQuote, STORED_QUOTE_ID } from '../../../../fixtures/quoteFixtures.js';

const now = new Date('2026-09-21T18:01:00.000Z');

function harness() {
  const quotes = createFakeCollection();
  const requests = createFakeCollection();
  const bookings = createFakeCollection();
  const outbox = createFakeCollection();
  const collections: Record<string, unknown> = { quotes, goalkeeperRequests: requests, bookings, outbox };
  const db = { collection: (name: string) => collections[name] as Collection<Document> } as unknown as Db;
  // Runs the callback once, as the driver does when nothing is transient.
  const session = {
    withTransaction: vi.fn(async (fn: (s: ClientSession) => Promise<unknown>, _options?: unknown) =>
      fn(session as unknown as ClientSession),
    ),
    endSession: vi.fn(async () => undefined),
  };
  const store = new MongoQuoteConfirmationStore(() => session as unknown as ClientSession, db);
  const build = (quote: Quote) => {
    const request = GoalkeeperRequest.fromQuote('r-1', quote, 'keep_confirmed', now);
    const created = [Booking.forRequest('b-1', request, now), Booking.forRequest('b-2', request, now)];
    return { request, bookings: created, events: created.map((booking, index) => bookingCreated(`ev-${index + 1}`, booking, request, now)) };
  };
  requests.insertOne.mockResolvedValue({});
  bookings.insertMany.mockResolvedValue({});
  outbox.insertMany.mockResolvedValue({});
  return { quotes, requests, bookings, outbox, session, store, build };
}

function duplicateKeyError(keyPattern: Record<string, number>) {
  return Object.assign(new Error('E11000 duplicate key error'), { code: 11000, keyPattern });
}

describe('MongoQuoteConfirmationStore (mocked driver)', () => {
  it("claims only the caller's unexpired quote, and every write is inside the transaction", async () => {
    const { quotes, requests, bookings, outbox, session, store, build } = harness();
    quotes.findOneAndDelete.mockResolvedValue(quoteToDocument(buildStoredQuote()));

    const result = await store.claimAndCreateRequest(STORED_QUOTE_ID, 'client-a', now, build);

    expect(quotes.findOneAndDelete).toHaveBeenCalledWith(
      { _id: STORED_QUOTE_ID, clientId: 'client-a', expiresAt: { $gt: now } },
      { session },
    );
    expect(requests.insertOne.mock.calls[0]![1]).toEqual({ session });
    expect(bookings.insertMany.mock.calls[0]![1]).toEqual({ session, ordered: true });
    // Feature 013: one booking.created per booking, in the same transaction.
    expect(outbox.insertMany.mock.calls[0]![0]).toMatchObject([
      { _id: 'ev-1', type: 'booking.created', bookingId: 'b-1', status: 'pending' },
      { _id: 'ev-2', type: 'booking.created', bookingId: 'b-2', status: 'pending' },
    ]);
    expect(outbox.insertMany.mock.calls[0]![1]).toEqual({ session });
    expect(result).toMatchObject({ kind: 'created', events: [{ id: 'ev-1' }, { id: 'ev-2' }] });
  });

  it('inserts the request and all its bookings built from the deleted quote', async () => {
    const { quotes, requests, bookings, store, build } = harness();
    const quote = buildStoredQuote();
    quotes.findOneAndDelete.mockResolvedValue(quoteToDocument(quote));

    const result = await store.claimAndCreateRequest(STORED_QUOTE_ID, 'client-a', now, build);

    const expected = build(quote);
    expect(requests.insertOne.mock.calls[0]![0]).toEqual(requestToDocument(expected.request));
    expect(bookings.insertMany.mock.calls[0]![0]).toEqual(expected.bookings.map(bookingToDocument));
    expect(result).toEqual({ kind: 'created', request: expected.request, bookings: expected.bookings, events: expected.events });
  });

  it('writes nothing when no claimable quote exists', async () => {
    const { quotes, requests, bookings, store, build } = harness();
    quotes.findOneAndDelete.mockResolvedValue(null);

    const result = await store.claimAndCreateRequest(STORED_QUOTE_ID, 'client-a', now, build);

    expect(result).toEqual({ kind: 'not_claimed' });
    expect(requests.insertOne).not.toHaveBeenCalled();
    expect(bookings.insertMany).not.toHaveBeenCalled();
  });

  it('classifies a quoteId violation as already requested (a concurrent confirmation won)', async () => {
    const { quotes, requests, store, build } = harness();
    quotes.findOneAndDelete.mockResolvedValue(quoteToDocument(buildStoredQuote()));
    requests.insertOne.mockRejectedValue(duplicateKeyError({ quoteId: 1 }));

    expect(await store.claimAndCreateRequest(STORED_QUOTE_ID, 'client-a', now, build)).toEqual({ kind: 'already_requested' });
  });

  it('classifies a client/zone/start violation as a duplicate request, reporting the attempted match', async () => {
    const { quotes, requests, store, build } = harness();
    quotes.findOneAndDelete.mockResolvedValue(quoteToDocument(buildStoredQuote()));
    requests.insertOne.mockRejectedValue(duplicateKeyError({ clientId: 1, zoneId: 1, startsAt: 1 }));

    expect(await store.claimAndCreateRequest(STORED_QUOTE_ID, 'client-a', now, build)).toEqual({
      kind: 'duplicate_request',
      zoneId: 'zone-cali-norte',
      startsAt: new Date('2026-09-21T20:00:00.000Z'),
    });
  });

  it('rethrows anything else and always ends the session', async () => {
    const { quotes, bookings, session, store, build } = harness();
    quotes.findOneAndDelete.mockResolvedValue(quoteToDocument(buildStoredQuote()));
    bookings.insertMany.mockRejectedValue(new Error('connection reset'));

    await expect(store.claimAndCreateRequest(STORED_QUOTE_ID, 'client-a', now, build)).rejects.toThrow('connection reset');
    expect(session.endSession).toHaveBeenCalledTimes(1);
  });
});
