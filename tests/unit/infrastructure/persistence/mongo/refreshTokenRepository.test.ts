import { describe, expect, it } from 'vitest';
import type { Collection, Db, Document } from 'mongodb';
import { RefreshTokenRepository } from '../../../../../src/infrastructure/persistence/mongo/refreshTokenRepository.js';
import { RefreshToken } from '../../../../../src/domain/users/refreshToken.js';
import { createFakeCollection } from '../../../../fakes/fakeMongoCollection.js';

function repositoryWith(collection: ReturnType<typeof createFakeCollection>) {
  const db = { collection: () => collection as unknown as Collection<Document> } as unknown as Db;
  return new RefreshTokenRepository(db);
}

describe('RefreshTokenRepository (mocked driver)', () => {
  it('maps a RefreshToken to and from a document', async () => {
    const collection = createFakeCollection();
    collection.insertOne.mockResolvedValue({ acknowledged: true, insertedId: 'rt-1' });
    const repository = repositoryWith(collection);

    await repository.add(RefreshToken.create('rt-1', 'user-1', 'hash-abc', 1000 * 60));

    const doc = collection.insertOne.mock.calls[0]![0] as Record<string, unknown>;
    expect(doc).toMatchObject({ _id: 'rt-1', userId: 'user-1', tokenHash: 'hash-abc', isUsed: false });
  });

  it('findActiveByHash queries for an unused, unexpired token by hash', async () => {
    const collection = createFakeCollection();
    collection.findOne.mockResolvedValue(null);
    const repository = repositoryWith(collection);

    await repository.findActiveByHash('hash-abc');

    expect(collection.findOne).toHaveBeenCalledWith({
      tokenHash: 'hash-abc',
      isUsed: false,
      expiresAt: { $gt: expect.any(Date) },
    });
  });

  it('markUsed performs a partial update, not a full replace', async () => {
    const collection = createFakeCollection();
    collection.updateOne.mockResolvedValue({ acknowledged: true, matchedCount: 1, modifiedCount: 1, upsertedCount: 0, upsertedId: null });
    const repository = repositoryWith(collection);

    await repository.markUsed('rt-1');

    expect(collection.updateOne).toHaveBeenCalledWith({ _id: 'rt-1' }, { $set: { isUsed: true } });
    expect(collection.replaceOne).not.toHaveBeenCalled();
  });
});
