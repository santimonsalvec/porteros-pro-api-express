import { describe, expect, it } from 'vitest';
import type { Collection, Db, Document } from 'mongodb';
import { Booking } from '../../../../../src/domain/bookings/booking.js';
import {
  BookingRepository,
  bookingToDocument,
} from '../../../../../src/infrastructure/persistence/mongo/bookingRepository.js';
import { createFakeCollection } from '../../../../fakes/fakeMongoCollection.js';
import { buildStoredQuote, STORED_QUOTE_ID } from '../../../../fixtures/quoteFixtures.js';

function repositoryWith(collection: ReturnType<typeof createFakeCollection>) {
  const db = { collection: () => collection as unknown as Collection<Document> } as unknown as Db;
  return new BookingRepository(db);
}

const booking = Booking.fromQuote('b-1', buildStoredQuote(), new Date('2026-09-21T18:01:00.000Z'));

describe('BookingRepository (mocked driver)', () => {
  it('creates the one-booking-per-quote and one-booking-per-match unique indexes', async () => {
    const collection = createFakeCollection();
    await repositoryWith(collection).ensureIndexes();

    expect(collection.createIndex).toHaveBeenCalledWith(
      { quoteId: 1 },
      { name: 'quoteId_unique', unique: true },
    );
    expect(collection.createIndex).toHaveBeenCalledWith(
      { clientId: 1, zoneId: 1, startsAt: 1 },
      { name: 'client_zone_start_unique', unique: true },
    );
  });

  it('repeats zoneId and startsAt at the top level of the document', () => {
    const doc = bookingToDocument(booking);

    expect(doc).toMatchObject({
      _id: 'b-1',
      clientId: 'client-a',
      quoteId: STORED_QUOTE_ID,
      status: 'pending_assignment',
      zoneId: 'zone-cali-norte',
      startsAt: new Date('2026-09-21T20:00:00.000Z'),
    });
    expect(doc.createdAt).toBeInstanceOf(Date);
    expect(doc.quoteIssuedAt).toBeInstanceOf(Date);
  });

  it('finds the booking of a quote for its client and maps it back', async () => {
    const collection = createFakeCollection();
    collection.findOne.mockResolvedValue(bookingToDocument(booking));

    const found = await repositoryWith(collection).findByQuoteForClient(
      STORED_QUOTE_ID,
      'client-a',
    );

    expect(collection.findOne).toHaveBeenCalledWith({
      quoteId: STORED_QUOTE_ID,
      clientId: 'client-a',
    });
    expect(found).toEqual(booking);
  });

  it("finds the client's booking for a zone and start", async () => {
    const collection = createFakeCollection();
    collection.findOne.mockResolvedValue(null);
    const startsAt = new Date('2026-09-21T20:00:00.000Z');

    const found = await repositoryWith(collection).findByMatchForClient(
      'client-a',
      'zone-cali-norte',
      startsAt,
    );

    expect(collection.findOne).toHaveBeenCalledWith({
      clientId: 'client-a',
      zoneId: 'zone-cali-norte',
      startsAt,
    });
    expect(found).toBeNull();
  });
});
