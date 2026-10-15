import { describe, expect, it } from 'vitest';
import type { Collection, Db, Document } from 'mongodb';
import { operatingBalanceAdminFilter, operatingBalanceAdminSort } from '../../../../../src/infrastructure/persistence/mongo/operatingBalanceAdminPipelines.js';
import { OperatingBalanceRepository } from '../../../../../src/infrastructure/persistence/mongo/operatingBalanceRepository.js';
import { createFakeCollection } from '../../../../fakes/fakeMongoCollection.js';

// Admin spec 007, US3 (research §4): the operating balances' filters, the balance order and its index.

describe('operatingBalanceAdminFilter', () => {
  it('is empty without filters, and keeps to the goalkeepers of a country and to debts', () => {
    expect(operatingBalanceAdminFilter({})).toEqual({});
    expect(operatingBalanceAdminFilter({ goalkeeperIds: ['gk-1', 'gk-2'], negative: true })).toEqual({ _id: { $in: ['gk-1', 'gk-2'] }, balance: { $lt: 0 } });
  });

  it('orders by balance either way, with a stable tie-break', () => {
    expect(operatingBalanceAdminSort('balance_asc')).toEqual({ balance: 1, _id: 1 });
    expect(operatingBalanceAdminSort('balance_desc')).toEqual({ balance: -1, _id: 1 });
  });

  it('creates the balance index', async () => {
    const collection = createFakeCollection();
    collection.createIndex.mockResolvedValue('ok');
    await new OperatingBalanceRepository({ collection: () => collection as unknown as Collection<Document> } as unknown as Db).ensureAdminIndexes();
    expect(collection.createIndex.mock.calls).toEqual([[{ balance: 1, _id: 1 }, { name: 'balance_id' }]]);
  });
});
