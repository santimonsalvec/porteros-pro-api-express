import { describe, expect, it, vi } from 'vitest';
import type { ClientSession, Collection, Db, Document } from 'mongodb';
import type { MovementDraft } from '../../../../../src/application/features/operatingBalance/common/ports.js';
import { MongoOperatingBalanceStore } from '../../../../../src/infrastructure/persistence/mongo/operatingBalanceStore.js';
import { createFakeCollection } from '../../../../fakes/fakeMongoCollection.js';
import { COLOMBIA_INVOICING } from '../../../../fixtures/operatingBalanceFixtures.js';

const now = new Date('2026-09-27T18:00:00.000Z');

function draft(overrides: Partial<MovementDraft> = {}): MovementDraft {
  return {
    id: 'm-1',
    goalkeeperId: 'gk-1',
    type: 'commission_charge',
    amount: -7000,
    currency: 'COP',
    occurredAt: now,
    causeKey: 'commission:b-1',
    actor: { kind: 'system', userId: null },
    references: { bookingId: 'b-1', requestId: 'r-1' },
    cancellation: null,
    reason: null,
    invoicing: COLOMBIA_INVOICING,
    ...overrides,
  };
}

function harness() {
  const operatingBalances = createFakeCollection();
  const movements = createFakeCollection();
  const collections: Record<string, unknown> = { operatingBalances, balanceMovements: movements };
  const db = { collection: (name: string) => collections[name] as Collection<Document> } as unknown as Db;
  const session = {
    withTransaction: vi.fn(async (fn: (s: ClientSession) => Promise<unknown>, _options?: unknown) =>
      fn(session as unknown as ClientSession),
    ),
    endSession: vi.fn(async () => undefined),
  };
  const store = new MongoOperatingBalanceStore(() => session as unknown as ClientSession, db, () => now);
  operatingBalances.updateOne.mockResolvedValue({});
  movements.insertOne.mockResolvedValue({});
  return { operatingBalances, movements, session, store };
}

const operatingBalanceDoc = (balance: number, lastSequence: number) => ({
  _id: 'gk-1',
  currency: 'COP',
  balance,
  lastSequence,
  createdAt: now,
  updatedAt: now,
});

describe('MongoOperatingBalanceStore (mocked driver)', () => {
  it('creates the operatingBalance lazily, then moves balance and sequence, then inserts the movement — all in the session', async () => {
    const { operatingBalances, movements, session, store } = harness();
    operatingBalances.findOneAndUpdate.mockResolvedValue(operatingBalanceDoc(13000, 2));

    const result = await store.append(draft());

    expect(operatingBalances.updateOne).toHaveBeenCalledWith(
      { _id: 'gk-1' },
      { $setOnInsert: { currency: 'COP', balance: 0, lastSequence: 0, createdAt: now }, $set: { updatedAt: now } },
      { upsert: true, session },
    );
    expect(operatingBalances.findOneAndUpdate.mock.calls[0]![1]).toEqual({ $inc: { balance: -7000, lastSequence: 1 } });
    expect(operatingBalances.findOneAndUpdate.mock.calls[0]![2]).toEqual({ returnDocument: 'after', session });
    expect(movements.insertOne.mock.calls[0]![0]).toMatchObject({ _id: 'm-1', operatingBalanceId: 'gk-1', sequence: 2, balanceAfter: 13000 });
    expect(movements.insertOne.mock.calls[0]![1]).toEqual({ session });
    expect(result).toMatchObject({ kind: 'recorded', movement: { sequence: 2, balanceAfter: 13000 }, operatingBalance: { balance: 13000 } });
  });

  it.each<[string, Partial<MovementDraft>, boolean]>([
    ['a commission charge', {}, true],
    ['a negative adjustment', { type: 'admin_adjustment', amount: -10000, causeKey: 'adjustment:k', reason: 'Corrección' }, true],
    ['a penalty', { type: 'penalty', causeKey: 'penalty:e-1' }, false],
    ['a credit', { type: 'deposit', amount: 20000, causeKey: 'deposit:t-1' }, false],
  ])('guards %s against going below zero: %s', async (_label, change, guarded) => {
    const { operatingBalances, store } = harness();
    operatingBalances.findOneAndUpdate.mockResolvedValue(operatingBalanceDoc(0, 1));

    await store.append(draft(change));

    const filter = operatingBalances.findOneAndUpdate.mock.calls[0]![0] as Document;
    expect(filter).toMatchObject({ _id: 'gk-1', currency: 'COP' });
    if (guarded) expect(filter.balance).toEqual({ $gte: -(change.amount ?? -7000) });
    else expect(filter).not.toHaveProperty('balance');
  });

  it('refuses a guarded debit the balance cannot cover, recording nothing', async () => {
    const { operatingBalances, movements, store } = harness();
    operatingBalances.findOneAndUpdate.mockResolvedValue(null);
    operatingBalances.findOne.mockResolvedValue(operatingBalanceDoc(5000, 3));

    expect(await store.append(draft())).toEqual({ kind: 'insufficient_funds', balance: 5000 });
    expect(movements.insertOne).not.toHaveBeenCalled();
  });

  it('treats a movement in another currency as a bug, not as a lack of funds', async () => {
    const { operatingBalances, store } = harness();
    operatingBalances.findOneAndUpdate.mockResolvedValue(null);
    operatingBalances.findOne.mockResolvedValue({ ...operatingBalanceDoc(50000, 1), currency: 'MXN' });

    await expect(store.append(draft())).rejects.toThrow(/MXN/);
  });

  it('returns the existing movement when the cause was already recorded', async () => {
    const { operatingBalances, movements, store } = harness();
    operatingBalances.findOneAndUpdate.mockResolvedValue(operatingBalanceDoc(13000, 2));
    movements.insertOne.mockRejectedValue(Object.assign(new Error('E11000'), { code: 11000, keyPattern: { causeKey: 1 } }));
    movements.findOne.mockResolvedValue({
      _id: 'm-original',
      operatingBalanceId: 'gk-1',
      sequence: 1,
      type: 'commission_charge',
      amount: -7000,
      currency: 'COP',
      balanceAfter: 13000,
      occurredAt: now,
      causeKey: 'commission:b-1',
      actor: { kind: 'system', userId: null },
      references: { bookingId: 'b-1' },
      cancellation: null,
      reason: null,
      invoicing: COLOMBIA_INVOICING,
    });

    const result = await store.append(draft());

    expect(movements.findOne).toHaveBeenCalledWith({ causeKey: 'commission:b-1' });
    expect(result).toMatchObject({ kind: 'duplicate', movement: { id: 'm-original' } });
  });

  it('rethrows anything else and always ends the session', async () => {
    const { operatingBalances, session, store } = harness();
    operatingBalances.findOneAndUpdate.mockRejectedValue(new Error('connection reset'));

    await expect(store.append(draft())).rejects.toThrow('connection reset');
    expect(session.endSession).toHaveBeenCalledTimes(1);
  });
});
