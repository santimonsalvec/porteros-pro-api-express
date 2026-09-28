import { describe, expect, it } from 'vitest';
import type { Collection, Db, Document } from 'mongodb';
import { WalletRepository } from '../../../../../src/infrastructure/persistence/mongo/walletRepository.js';
import { createFakeCollection } from '../../../../fakes/fakeMongoCollection.js';

function repositoryWith(collection: ReturnType<typeof createFakeCollection>) {
  const db = { collection: () => collection as unknown as Collection<Document> } as unknown as Db;
  return new WalletRepository(db);
}

describe('WalletRepository (mocked driver)', () => {
  it("reads a goalkeeper's wallet by its user id", async () => {
    const collection = createFakeCollection();
    const at = new Date('2026-09-27T18:00:00.000Z');
    collection.findOne.mockResolvedValue({ _id: 'gk-1', currency: 'COP', balance: 13000, lastSequence: 2, createdAt: at, updatedAt: at });

    const wallet = await repositoryWith(collection).findByGoalkeeperId('gk-1');

    expect(collection.findOne).toHaveBeenCalledWith({ _id: 'gk-1' });
    expect(wallet).toMatchObject({ goalkeeperId: 'gk-1', currency: 'COP', balance: 13000, lastSequence: 2 });
  });

  it('returns null before the first movement', async () => {
    const collection = createFakeCollection();
    collection.findOne.mockResolvedValue(null);

    expect(await repositoryWith(collection).findByGoalkeeperId('gk-1')).toBeNull();
  });
});
