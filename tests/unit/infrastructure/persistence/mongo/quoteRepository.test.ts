import { describe, expect, it } from 'vitest';
import type { Collection, Db, Document } from 'mongodb';
import {
  QuoteRepository,
  quoteToDocument,
} from '../../../../../src/infrastructure/persistence/mongo/quoteRepository.js';
import { createFakeCollection } from '../../../../fakes/fakeMongoCollection.js';
import { buildStoredQuote, STORED_QUOTE_ID } from '../../../../fixtures/quoteFixtures.js';

function repositoryWith(collection: ReturnType<typeof createFakeCollection>) {
  const db = { collection: () => collection as unknown as Collection<Document> } as unknown as Db;
  return new QuoteRepository(db);
}

describe('QuoteRepository (mocked driver)', () => {
  it('creates a TTL index that removes a quote at its expiresAt', async () => {
    const collection = createFakeCollection();
    await repositoryWith(collection).ensureIndexes();

    expect(collection.createIndex).toHaveBeenCalledWith(
      { expiresAt: 1 },
      { name: 'expiresAt_ttl', expireAfterSeconds: 0 },
    );
  });

  it('stores the dates as Date objects, which the TTL index requires', async () => {
    const collection = createFakeCollection();
    const quote = buildStoredQuote();

    await repositoryWith(collection).add(quote);

    const doc = collection.insertOne.mock.calls[0]![0] as Document;
    expect(doc).toMatchObject({ _id: STORED_QUOTE_ID, clientId: 'client-a', status: 'pending' });
    expect(doc.issuedAt).toBeInstanceOf(Date);
    expect(doc.expiresAt).toBeInstanceOf(Date);
    expect(doc.match.startsAt).toBeInstanceOf(Date);
    expect(doc.pricing).toEqual({
      unitRate: 55000,
      subtotal: 110000,
      unitSurcharge: 5000,
      surcharge: 10000,
      total: 120000,
      currency: 'COP',
    });
  });

  it('looks a quote up by id AND client, and maps it back', async () => {
    const collection = createFakeCollection();
    const quote = buildStoredQuote();
    collection.findOne.mockResolvedValue(quoteToDocument(quote));

    const found = await repositoryWith(collection).findByIdForClient(STORED_QUOTE_ID, 'client-a');

    expect(collection.findOne).toHaveBeenCalledWith({ _id: STORED_QUOTE_ID, clientId: 'client-a' });
    expect(found).toEqual(quote);
  });

  it('returns null when no quote matches', async () => {
    const collection = createFakeCollection();
    collection.findOne.mockResolvedValue(null);

    expect(
      await repositoryWith(collection).findByIdForClient(STORED_QUOTE_ID, 'client-b'),
    ).toBeNull();
  });
});
