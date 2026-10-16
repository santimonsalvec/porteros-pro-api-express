import { describe, expect, it, vi } from 'vitest';
import type { ClientSession, Collection, Db, Document } from 'mongodb';
import type { ApplyOutcomeArgs } from '../../../../../src/application/features/payments/common/ports.js';
import { Deposit, type DepositStatus } from '../../../../../src/domain/deposits/deposit.js';
import { MongoDepositStore } from '../../../../../src/infrastructure/persistence/mongo/depositStore.js';
import { depositToDocument } from '../../../../../src/infrastructure/persistence/mongo/depositRepository.js';
import { createFakeCollection } from '../../../../fakes/fakeMongoCollection.js';
import { COLOMBIA_INVOICING } from '../../../../fixtures/operatingBalanceFixtures.js';

const NOW = new Date('2026-09-29T12:00:00.000Z');
const LATER = new Date('2026-09-29T12:05:00.000Z');

function depositDoc(status: DepositStatus = 'pending', cost = 1464): Document {
  const deposit = Deposit.start({ id: 't-1', goalkeeperId: 'gk-1', countryId: 'country-co', marketId: 'city-cali', gateway: 'wompi', environment: 'sandbox', amount: 20000, cost, currency: 'COP', now: NOW });
  return depositToDocument(Deposit.rehydrate({ ...deposit.toProps(), status }));
}

function args(overrides: Partial<ApplyOutcomeArgs> = {}): ApplyOutcomeArgs {
  return {
    depositId: 't-1',
    status: 'approved',
    gatewayTransactionId: 'tx-1',
    charged: { amountInCents: 2000000, currency: 'COP' },
    owner: { goalkeeperId: 'gk-1', currency: 'COP', invoicing: COLOMBIA_INVOICING, marketId: 'city-cali' },
    now: LATER,
    ...overrides,
  };
}

function harness(doc: Document | null, balances: number[] = [-10000, -11464]) {
  const deposits = createFakeCollection();
  const operatingBalances = createFakeCollection();
  const movements = createFakeCollection();
  const collections: Record<string, unknown> = { deposits, operatingBalances, balanceMovements: movements };
  const db = { collection: (name: string) => collections[name] as Collection<Document> } as unknown as Db;
  const session = {
    withTransaction: vi.fn(async (fn: () => Promise<unknown>) => fn()),
    endSession: vi.fn(async () => undefined),
  };
  let id = 0;
  const store = new MongoDepositStore(() => session as unknown as ClientSession, db, () => `m-${++id}`);
  deposits.findOne.mockResolvedValue(doc);
  deposits.updateOne.mockResolvedValue({ matchedCount: 1 });
  operatingBalances.updateOne.mockResolvedValue({});
  balances.forEach((balance, index) =>
    operatingBalances.findOneAndUpdate.mockResolvedValueOnce({ _id: 'gk-1', currency: 'COP', balance, lastSequence: 5 + index, createdAt: NOW, updatedAt: NOW }),
  );
  movements.insertOne.mockResolvedValue({});
  return { deposits, operatingBalances, movements, session, store };
}

describe('MongoDepositStore (mocked driver)', () => {
  it('credits an approval: the gross deposit, then the fee, then the status — all in the session', async () => {
    const { deposits, operatingBalances, movements, session, store } = harness(depositDoc());

    const result = await store.applyOutcome(args());

    expect(deposits.findOne).toHaveBeenCalledWith({ _id: 't-1' }, { session });
    expect(operatingBalances.findOneAndUpdate.mock.calls.map((call) => call[1])).toEqual([
      { $inc: { balance: 20000, lastSequence: 1 } },
      { $inc: { balance: -1464, lastSequence: 1 } },
    ]);
    // Neither movement is guarded: a operating balance in debt still takes both.
    expect(operatingBalances.findOneAndUpdate.mock.calls.map((call) => call[0])).toEqual([
      { _id: 'gk-1', currency: 'COP' },
      { _id: 'gk-1', currency: 'COP' },
    ]);
    expect(movements.insertOne.mock.calls.map((call) => call[0])).toMatchObject([
      { _id: 'm-1', type: 'deposit', amount: 20000, causeKey: 'deposit:t-1', references: { depositId: 't-1' } },
      { _id: 'm-2', type: 'gateway_fee', amount: -1464, causeKey: 'gateway_fee:t-1', references: { depositId: 't-1' } },
    ]);
    expect(deposits.updateOne).toHaveBeenCalledWith(
      { _id: 't-1', status: 'pending' },
      { $set: { status: 'approved', gatewayTransactionId: 'tx-1', finalizedAt: LATER, nextCheckAt: null } },
      { session },
    );
    expect(result).toMatchObject({ kind: 'applied', balance: -11464, deposit: { status: 'approved' } });
    expect(session.endSession).toHaveBeenCalled();
  });

  it('skips the fee movement when the deposit costs nothing', async () => {
    const { movements, store } = harness(depositDoc('pending', 0), [20000]);

    await store.applyOutcome(args());

    expect(movements.insertOne).toHaveBeenCalledTimes(1);
  });

  it('records a decline without touching the operatingBalance', async () => {
    const { deposits, operatingBalances, store } = harness(depositDoc());

    const result = await store.applyOutcome(args({ status: 'declined' }));

    expect(operatingBalances.findOneAndUpdate).not.toHaveBeenCalled();
    expect(deposits.updateOne.mock.calls[0]![1]).toMatchObject({ $set: { status: 'declined' } });
    expect(result).toMatchObject({ kind: 'applied', balance: null });
  });

  it('credits a late approval of an expired deposit', async () => {
    const { deposits, store } = harness(depositDoc('expired'));

    expect(await store.applyOutcome(args())).toMatchObject({ kind: 'applied' });
    expect(deposits.updateOne.mock.calls[0]![0]).toEqual({ _id: 't-1', status: 'expired' });
  });

  it('changes nothing for an outcome already recorded', async () => {
    const { deposits, operatingBalances, store } = harness(depositDoc('approved'));

    expect(await store.applyOutcome(args())).toMatchObject({ kind: 'unchanged' });
    expect(operatingBalances.findOneAndUpdate).not.toHaveBeenCalled();
    expect(deposits.updateOne).not.toHaveBeenCalled();
  });

  it.each([
    ['another amount', { amountInCents: 1000000, currency: 'COP' }],
    ['another currency', { amountInCents: 2000000, currency: 'USD' }],
  ])('never credits %s', async (_label, charged) => {
    const { deposits, operatingBalances, store } = harness(depositDoc());

    expect(await store.applyOutcome(args({ charged }))).toMatchObject({ kind: 'mismatch' });
    expect(operatingBalances.findOneAndUpdate).not.toHaveBeenCalled();
    expect(deposits.updateOne).not.toHaveBeenCalled();
  });

  it('expires without a charge to compare', async () => {
    const { store } = harness(depositDoc());

    expect(await store.applyOutcome(args({ status: 'expired', charged: null, gatewayTransactionId: null }))).toMatchObject({
      kind: 'applied',
      deposit: { status: 'expired' },
    });
  });

  it('answers not found for an unknown deposit', async () => {
    const { store } = harness(null);

    expect(await store.applyOutcome(args())).toEqual({ kind: 'not_found' });
  });

  it('fails (so the transaction aborts) when the status changed under it', async () => {
    const { deposits, store } = harness(depositDoc('pending'), [20000, 18536]);
    deposits.updateOne.mockResolvedValue({ matchedCount: 0 });

    await expect(store.applyOutcome(args())).rejects.toThrow(/changed/);
  });
});
