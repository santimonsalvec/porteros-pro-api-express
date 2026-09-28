import { describe, expect, it } from 'vitest';
import type { Collection, Db, Document } from 'mongodb';
import { WalletMovement } from '../../../../../src/domain/wallet/walletMovement.js';
import {
  movementFromDocument,
  movementToDocument,
  WalletMovementRepository,
} from '../../../../../src/infrastructure/persistence/mongo/walletMovementRepository.js';
import { createFakeCollection, toArrayCursor } from '../../../../fakes/fakeMongoCollection.js';
import { COLOMBIA_INVOICING } from '../../../../fixtures/walletFixtures.js';

function repositoryWith(collection: ReturnType<typeof createFakeCollection>) {
  const db = { collection: () => collection as unknown as Collection<Document> } as unknown as Db;
  return new WalletMovementRepository(db);
}

const refund = WalletMovement.rehydrate({
  id: 'm-2',
  walletId: 'gk-1',
  sequence: 2,
  type: 'commission_refund',
  amount: 7000,
  currency: 'COP',
  balanceAfter: 20000,
  occurredAt: new Date('2026-09-27T18:05:00.000Z'),
  causeKey: 'commission_refund:b-1',
  actor: { kind: 'system', userId: null },
  references: { bookingId: 'b-1', requestId: 'r-1' },
  cancellation: { by: 'client', at: new Date('2026-09-27T18:04:00.000Z'), reason: 'Un amigo tapa' },
  reason: null,
  invoicing: COLOMBIA_INVOICING,
});

describe('WalletMovementRepository (mocked driver)', () => {
  it('creates the one-movement-per-cause and per-wallet sequence indexes', async () => {
    const collection = createFakeCollection();
    await repositoryWith(collection).ensureIndexes();

    expect(collection.createIndex).toHaveBeenCalledWith({ causeKey: 1 }, { name: 'causeKey_unique', unique: true });
    expect(collection.createIndex).toHaveBeenCalledWith({ walletId: 1, sequence: -1 }, { name: 'wallet_sequence_unique', unique: true });
  });

  it('round-trips a movement with its dates as Dates', () => {
    const doc = movementToDocument(refund);

    expect(doc.occurredAt).toBeInstanceOf(Date);
    expect(doc.cancellation.at).toBeInstanceOf(Date);
    expect(movementFromDocument(doc)).toEqual(refund);
  });

  it('finds a movement by its cause key', async () => {
    const collection = createFakeCollection();
    collection.findOne.mockResolvedValue(movementToDocument(refund));

    expect(await repositoryWith(collection).findByCauseKey('commission_refund:b-1')).toEqual(refund);
    expect(collection.findOne).toHaveBeenCalledWith({ causeKey: 'commission_refund:b-1' });
  });

  it("lists a wallet's movements newest first", async () => {
    const collection = createFakeCollection();
    const cursor = toArrayCursor([movementToDocument(refund)]);
    collection.find.mockReturnValue(cursor);

    const found = await repositoryWith(collection).listForWallet('gk-1', 20, 10);

    expect(collection.find).toHaveBeenCalledWith({ walletId: 'gk-1' });
    expect(cursor.sort).toHaveBeenCalledWith({ sequence: -1 });
    expect(cursor.skip).toHaveBeenCalledWith(20);
    expect(cursor.limit).toHaveBeenCalledWith(10);
    expect(found).toEqual([refund]);
  });
});
