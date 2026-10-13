import { describe, expect, it } from 'vitest';
import type { Collection, Db, Document } from 'mongodb';
import { walletAdminFilter, walletAdminSort } from '../../../../../src/infrastructure/persistence/mongo/walletAdminPipelines.js';
import { WalletRepository } from '../../../../../src/infrastructure/persistence/mongo/walletRepository.js';
import { createFakeCollection } from '../../../../fakes/fakeMongoCollection.js';

// Admin spec 007, US3 (research §4): the wallets' filters, the balance order and its index.

describe('walletAdminFilter', () => {
  it('is empty without filters, and keeps to the goalkeepers of a country and to debts', () => {
    expect(walletAdminFilter({})).toEqual({});
    expect(walletAdminFilter({ goalkeeperIds: ['gk-1', 'gk-2'], negative: true })).toEqual({ _id: { $in: ['gk-1', 'gk-2'] }, balance: { $lt: 0 } });
  });

  it('orders by balance either way, with a stable tie-break', () => {
    expect(walletAdminSort('balance_asc')).toEqual({ balance: 1, _id: 1 });
    expect(walletAdminSort('balance_desc')).toEqual({ balance: -1, _id: 1 });
  });

  it('creates the balance index', async () => {
    const collection = createFakeCollection();
    collection.createIndex.mockResolvedValue('ok');
    await new WalletRepository({ collection: () => collection as unknown as Collection<Document> } as unknown as Db).ensureAdminIndexes();
    expect(collection.createIndex.mock.calls).toEqual([[{ balance: 1, _id: 1 }, { name: 'balance_id' }]]);
  });
});
