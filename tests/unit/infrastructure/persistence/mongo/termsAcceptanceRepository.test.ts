import { describe, expect, it } from 'vitest';
import type { Collection, Db, Document } from 'mongodb';
import { TermsAcceptanceRepository } from '../../../../../src/infrastructure/persistence/mongo/termsAcceptanceRepository.js';
import { TermsAcceptance } from '../../../../../src/domain/users/termsAcceptance.js';
import { createFakeCollection, toArrayCursor } from '../../../../fakes/fakeMongoCollection.js';

function repositoryWith(collection: ReturnType<typeof createFakeCollection>) {
  const db = { collection: () => collection as unknown as Collection<Document> } as unknown as Db;
  return new TermsAcceptanceRepository(db);
}

describe('TermsAcceptanceRepository (mocked driver)', () => {
  it('omits ip/user-agent from the document entirely when null', async () => {
    const collection = createFakeCollection();
    collection.insertOne.mockResolvedValue({ acknowledged: true, insertedId: 'ta-1' });
    const repository = repositoryWith(collection);

    await repository.add(
      new TermsAcceptance({
        id: 'ta-1',
        userId: 'user-1',
        termsVersion: '1.0',
        privacyPolicyVersion: '1.0',
        acceptedAt: new Date(),
        ipAddress: null,
        userAgent: null,
      }),
    );

    const doc = collection.insertOne.mock.calls[0]![0] as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(doc, 'ipAddress')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(doc, 'userAgent')).toBe(false);
  });

  it('stores ip/user-agent when provided and maps them back', async () => {
    const collection = createFakeCollection();
    collection.findOne.mockResolvedValue({
      _id: 'ta-2',
      userId: 'user-2',
      termsVersion: '1.0',
      privacyPolicyVersion: '1.0',
      acceptedAt: new Date(),
      ipAddress: '1.2.3.4',
      userAgent: 'test-agent',
    });
    const repository = repositoryWith(collection);

    const found = await repository.getById('ta-2');

    expect(found?.ipAddress).toBe('1.2.3.4');
    expect(found?.userAgent).toBe('test-agent');
  });

  it('reads the user\'s latest acceptance, newest first', async () => {
    const collection = createFakeCollection();
    const cursor = toArrayCursor([
      { _id: 'ta-3', userId: 'user-3', termsVersion: '2.0', privacyPolicyVersion: '1.0', acceptedAt: new Date('2026-09-29T00:00:00Z') },
    ]);
    collection.find.mockReturnValue(cursor);
    const repository = repositoryWith(collection);

    const latest = await repository.findLatestForUser('user-3');

    expect(collection.find).toHaveBeenCalledWith({ userId: 'user-3' });
    expect(cursor.sort).toHaveBeenCalledWith({ acceptedAt: -1 });
    expect(cursor.limit).toHaveBeenCalledWith(1);
    expect(latest?.termsVersion).toBe('2.0');
  });

  it('answers null for a user who never accepted', async () => {
    const collection = createFakeCollection();
    collection.find.mockReturnValue(toArrayCursor([]));

    expect(await repositoryWith(collection).findLatestForUser('nobody')).toBeNull();
  });
});
