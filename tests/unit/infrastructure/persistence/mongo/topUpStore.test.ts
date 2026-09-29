import { describe, expect, it, vi } from 'vitest';
import type { ClientSession, Collection, Db, Document } from 'mongodb';
import type { ApplyOutcomeArgs } from '../../../../../src/application/features/payments/common/ports.js';
import { TopUp, type TopUpStatus } from '../../../../../src/domain/payments/topUp.js';
import { MongoTopUpStore } from '../../../../../src/infrastructure/persistence/mongo/topUpStore.js';
import { topUpToDocument } from '../../../../../src/infrastructure/persistence/mongo/topUpRepository.js';
import { createFakeCollection } from '../../../../fakes/fakeMongoCollection.js';
import { COLOMBIA_INVOICING } from '../../../../fixtures/walletFixtures.js';

const NOW = new Date('2026-09-29T12:00:00.000Z');
const LATER = new Date('2026-09-29T12:05:00.000Z');

function topUpDoc(status: TopUpStatus = 'pending', cost = 1464): Document {
  const topUp = TopUp.start({ id: 't-1', goalkeeperId: 'gk-1', countryId: 'country-co', gateway: 'wompi', environment: 'sandbox', amount: 20000, cost, currency: 'COP', now: NOW });
  return topUpToDocument(TopUp.rehydrate({ ...topUp.toProps(), status }));
}

function args(overrides: Partial<ApplyOutcomeArgs> = {}): ApplyOutcomeArgs {
  return {
    topUpId: 't-1',
    status: 'approved',
    gatewayTransactionId: 'tx-1',
    charged: { amountInCents: 2000000, currency: 'COP' },
    owner: { goalkeeperId: 'gk-1', currency: 'COP', invoicing: COLOMBIA_INVOICING },
    now: LATER,
    ...overrides,
  };
}

function harness(doc: Document | null, balances: number[] = [-10000, -11464]) {
  const topUps = createFakeCollection();
  const wallets = createFakeCollection();
  const movements = createFakeCollection();
  const collections: Record<string, unknown> = { topUps, wallets, walletMovements: movements };
  const db = { collection: (name: string) => collections[name] as Collection<Document> } as unknown as Db;
  const session = {
    withTransaction: vi.fn(async (fn: () => Promise<unknown>) => fn()),
    endSession: vi.fn(async () => undefined),
  };
  let id = 0;
  const store = new MongoTopUpStore(() => session as unknown as ClientSession, db, () => `m-${++id}`);
  topUps.findOne.mockResolvedValue(doc);
  topUps.updateOne.mockResolvedValue({ matchedCount: 1 });
  wallets.updateOne.mockResolvedValue({});
  balances.forEach((balance, index) =>
    wallets.findOneAndUpdate.mockResolvedValueOnce({ _id: 'gk-1', currency: 'COP', balance, lastSequence: 5 + index, createdAt: NOW, updatedAt: NOW }),
  );
  movements.insertOne.mockResolvedValue({});
  return { topUps, wallets, movements, session, store };
}

describe('MongoTopUpStore (mocked driver)', () => {
  it('credits an approval: the gross top-up, then the fee, then the status — all in the session', async () => {
    const { topUps, wallets, movements, session, store } = harness(topUpDoc());

    const result = await store.applyOutcome(args());

    expect(topUps.findOne).toHaveBeenCalledWith({ _id: 't-1' }, { session });
    expect(wallets.findOneAndUpdate.mock.calls.map((call) => call[1])).toEqual([
      { $inc: { balance: 20000, lastSequence: 1 } },
      { $inc: { balance: -1464, lastSequence: 1 } },
    ]);
    // Neither movement is guarded: a wallet in debt still takes both.
    expect(wallets.findOneAndUpdate.mock.calls.map((call) => call[0])).toEqual([
      { _id: 'gk-1', currency: 'COP' },
      { _id: 'gk-1', currency: 'COP' },
    ]);
    expect(movements.insertOne.mock.calls.map((call) => call[0])).toMatchObject([
      { _id: 'm-1', type: 'top_up', amount: 20000, causeKey: 'top_up:t-1', references: { topUpId: 't-1' } },
      { _id: 'm-2', type: 'gateway_fee', amount: -1464, causeKey: 'gateway_fee:t-1', references: { topUpId: 't-1' } },
    ]);
    expect(topUps.updateOne).toHaveBeenCalledWith(
      { _id: 't-1', status: 'pending' },
      { $set: { status: 'approved', gatewayTransactionId: 'tx-1', finalizedAt: LATER, nextCheckAt: null } },
      { session },
    );
    expect(result).toMatchObject({ kind: 'applied', balance: -11464, topUp: { status: 'approved' } });
    expect(session.endSession).toHaveBeenCalled();
  });

  it('skips the fee movement when the top-up costs nothing', async () => {
    const { movements, store } = harness(topUpDoc('pending', 0), [20000]);

    await store.applyOutcome(args());

    expect(movements.insertOne).toHaveBeenCalledTimes(1);
  });

  it('records a decline without touching the wallet', async () => {
    const { topUps, wallets, store } = harness(topUpDoc());

    const result = await store.applyOutcome(args({ status: 'declined' }));

    expect(wallets.findOneAndUpdate).not.toHaveBeenCalled();
    expect(topUps.updateOne.mock.calls[0]![1]).toMatchObject({ $set: { status: 'declined' } });
    expect(result).toMatchObject({ kind: 'applied', balance: null });
  });

  it('credits a late approval of an expired top-up', async () => {
    const { topUps, store } = harness(topUpDoc('expired'));

    expect(await store.applyOutcome(args())).toMatchObject({ kind: 'applied' });
    expect(topUps.updateOne.mock.calls[0]![0]).toEqual({ _id: 't-1', status: 'expired' });
  });

  it('changes nothing for an outcome already recorded', async () => {
    const { topUps, wallets, store } = harness(topUpDoc('approved'));

    expect(await store.applyOutcome(args())).toMatchObject({ kind: 'unchanged' });
    expect(wallets.findOneAndUpdate).not.toHaveBeenCalled();
    expect(topUps.updateOne).not.toHaveBeenCalled();
  });

  it.each([
    ['another amount', { amountInCents: 1000000, currency: 'COP' }],
    ['another currency', { amountInCents: 2000000, currency: 'USD' }],
  ])('never credits %s', async (_label, charged) => {
    const { topUps, wallets, store } = harness(topUpDoc());

    expect(await store.applyOutcome(args({ charged }))).toMatchObject({ kind: 'mismatch' });
    expect(wallets.findOneAndUpdate).not.toHaveBeenCalled();
    expect(topUps.updateOne).not.toHaveBeenCalled();
  });

  it('expires without a charge to compare', async () => {
    const { store } = harness(topUpDoc());

    expect(await store.applyOutcome(args({ status: 'expired', charged: null, gatewayTransactionId: null }))).toMatchObject({
      kind: 'applied',
      topUp: { status: 'expired' },
    });
  });

  it('answers not found for an unknown top-up', async () => {
    const { store } = harness(null);

    expect(await store.applyOutcome(args())).toEqual({ kind: 'not_found' });
  });

  it('fails (so the transaction aborts) when the status changed under it', async () => {
    const { topUps, store } = harness(topUpDoc('pending'), [20000, 18536]);
    topUps.updateOne.mockResolvedValue({ matchedCount: 0 });

    await expect(store.applyOutcome(args())).rejects.toThrow(/changed/);
  });
});
