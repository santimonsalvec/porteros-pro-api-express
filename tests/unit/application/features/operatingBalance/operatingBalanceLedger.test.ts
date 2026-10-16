import { beforeEach, describe, expect, it } from 'vitest';
import { OperatingBalanceLedger, type LedgerOwner } from '../../../../../src/application/features/operatingBalance/common/operatingBalanceLedger.js';
import { FixedClock } from '../../../../fakes/fakeClock.js';
import { FakeOperatingBalanceStore } from '../../../../fakes/fakeOperatingBalanceStore.js';
import { COLOMBIA_INVOICING, OPERATING_BALANCE_NOW } from '../../../../fixtures/operatingBalanceFixtures.js';

const owner: LedgerOwner = { goalkeeperId: 'gk-1', currency: 'COP', invoicing: COLOMBIA_INVOICING, marketId: 'city-cali' };

let store: FakeOperatingBalanceStore;
let ledger: OperatingBalanceLedger;
let counter: number;

beforeEach(() => {
  store = new FakeOperatingBalanceStore();
  counter = 0;
  ledger = new OperatingBalanceLedger(store, store, { newId: () => `m-${++counter}` }, new FixedClock(OPERATING_BALANCE_NOW));
});

const credit = (amount: number, key: string) =>
  ledger.adjust(owner, { adminUserId: 'admin-1', amount, reason: 'Saldo de pruebas', operationKey: key });

const balanceOf = async () => (await store.findByGoalkeeperId('gk-1'))?.balance ?? 0;
const sumOfMovements = () => store.movements().reduce((sum, movement) => sum + movement.amount, 0);

describe('OperatingBalanceLedger — US1: every change is a recorded movement', () => {
  it('records movements in order with their resulting balances', async () => {
    await credit(20000, 'k-1');
    await ledger.chargeCommission(owner, { bookingId: 'b-1', requestId: 'r-1', amount: 7000 });
    await ledger.refundCommission(owner, {
      bookingId: 'b-1',
      requestId: 'r-1',
      cancellation: { by: 'client', at: new Date(OPERATING_BALANCE_NOW), reason: 'Un amigo tapa' },
    });
    await ledger.applyPenalty(owner, { penaltyEventId: 'e-1', amount: 7000 });

    expect(store.movements().map((movement) => [movement.type, movement.amount, movement.balanceAfter, movement.sequence])).toEqual([
      ['admin_adjustment', 20000, 20000, 1],
      ['commission_charge', -7000, 13000, 2],
      ['commission_refund', 7000, 20000, 3],
      ['penalty', -7000, 13000, 4],
    ]);
    expect(await balanceOf()).toBe(sumOfMovements());
  });

  it('records a cause only once: a repeat returns the existing movement and leaves the balance alone', async () => {
    await credit(20000, 'k-1');
    const first = await ledger.chargeCommission(owner, { bookingId: 'b-1', requestId: 'r-1', amount: 7000 });
    const again = await ledger.chargeCommission(owner, { bookingId: 'b-1', requestId: 'r-1', amount: 7000 });

    expect(first.kind).toBe('recorded');
    expect(again).toMatchObject({ kind: 'duplicate', movement: { causeKey: 'commission:b-1' } });
    expect(store.movements()).toHaveLength(2);
    expect(await balanceOf()).toBe(13000);
  });

  it('refunds exactly what was charged and records who cancelled, when and why', async () => {
    await credit(20000, 'k-1');
    await ledger.chargeCommission(owner, { bookingId: 'b-1', requestId: 'r-1', amount: 7000 });
    const cancellation = { by: 'client' as const, at: new Date('2026-09-27T17:00:00.000Z'), reason: 'Un amigo tapa' };

    const refund = await ledger.refundCommission(owner, { bookingId: 'b-1', requestId: 'r-1', cancellation });

    expect(refund).toMatchObject({
      kind: 'recorded',
      movement: { type: 'commission_refund', amount: 7000, cancellation, references: { bookingId: 'b-1', requestId: 'r-1' } },
    });
  });

  it('has nothing to refund for a booking that was never charged', async () => {
    const refund = await ledger.refundCommission(owner, {
      bookingId: 'b-never',
      requestId: 'r-1',
      cancellation: { by: 'system', at: new Date(OPERATING_BALANCE_NOW), reason: 'cancel_all' },
    });

    expect(refund).toEqual({ kind: 'nothing_to_refund' });
    expect(store.movements()).toHaveLength(0);
  });

  it('lets a penalty take the balance below zero', async () => {
    const penalty = await ledger.applyPenalty(owner, { penaltyEventId: 'e-1', amount: 7000 });

    expect(penalty).toMatchObject({ kind: 'recorded', movement: { balanceAfter: -7000 } });
  });

  it('refuses a commission or a debit adjustment the balance cannot cover, recording nothing', async () => {
    await credit(5000, 'k-1');

    expect(await ledger.chargeCommission(owner, { bookingId: 'b-1', requestId: 'r-1', amount: 7000 })).toEqual({
      kind: 'insufficient_funds',
      balance: 5000,
    });
    expect(await credit(-6000, 'k-2')).toEqual({ kind: 'insufficient_funds', balance: 5000 });
    expect(store.movements()).toHaveLength(1);
  });

  it('reverses a penalty by giving back exactly what it took, once', async () => {
    await ledger.applyPenalty(owner, { penaltyEventId: 'e-1', amount: 7000 });

    const reversal = await ledger.reversePenalty(owner, { penaltyEventId: 'e-1', actor: { kind: 'admin', userId: 'admin-1' } });
    const again = await ledger.reversePenalty(owner, { penaltyEventId: 'e-1', actor: { kind: 'admin', userId: 'admin-1' } });

    expect(reversal).toMatchObject({ kind: 'recorded', movement: { type: 'penalty_reversal', amount: 7000, balanceAfter: 0 } });
    expect(again.kind).toBe('duplicate');
    expect(await ledger.reversePenalty(owner, { penaltyEventId: 'e-none', actor: { kind: 'admin', userId: 'admin-1' } })).toEqual({
      kind: 'nothing_to_reverse',
    });
  });

  it('credits a deposit once per payment', async () => {
    await ledger.creditDeposit(owner, { depositId: 't-1', amount: 20000 });
    await ledger.creditDeposit(owner, { depositId: 't-1', amount: 20000 });

    expect(await balanceOf()).toBe(20000);
  });

  it('records the administrator and the trimmed reason on an adjustment', async () => {
    const adjustment = await ledger.adjust(owner, { adminUserId: 'admin-1', amount: 50000, reason: '  Saldo inicial de pruebas ', operationKey: 'k-1' });

    expect(adjustment).toMatchObject({
      kind: 'recorded',
      movement: { actor: { kind: 'admin', userId: 'admin-1' }, reason: 'Saldo inicial de pruebas', causeKey: 'adjustment:k-1' },
    });
  });

  it('copies the invoicing snapshot onto every movement', async () => {
    await credit(20000, 'k-1');
    await ledger.chargeCommission(owner, { bookingId: 'b-1', requestId: 'r-1', amount: 7000 });

    expect(store.movements().every((movement) => movement.invoicing === COLOMBIA_INVOICING)).toBe(true);
  });

  it('keeps the balance equal to the sum of the movements across many movements', async () => {
    for (let i = 0; i < 30; i++) {
      await credit(1000 + i, `k-${i}`);
      if (i % 3 === 0) await ledger.chargeCommission(owner, { bookingId: `b-${i}`, requestId: 'r', amount: 700 });
      if (i % 5 === 0) await ledger.applyPenalty(owner, { penaltyEventId: `e-${i}`, amount: 300 });
    }

    expect(await balanceOf()).toBe(sumOfMovements());
    expect(store.movements().map((movement) => movement.sequence)).toEqual(store.movements().map((_, index) => index + 1));
  });
});

describe('OperatingBalanceLedger — feature 029: closing an account', () => {
  it('returns what is left as one closure refund, leaving the balance at zero', async () => {
    await credit(13000, 'k-1');

    const result = await ledger.refundClosure(owner, { closureId: 'c-1', amount: 13000, adminUserId: 'admin-1' });

    expect(result).toMatchObject({
      kind: 'recorded',
      movement: { type: 'closure_refund', amount: -13000, causeKey: 'closure_refund:c-1', references: { closureId: 'c-1' }, actor: { kind: 'admin', userId: 'admin-1' } },
    });
    expect(await balanceOf()).toBe(0);
  });

  it('answers the same movement when the refund is recorded again', async () => {
    await credit(13000, 'k-1');
    const first = await ledger.refundClosure(owner, { closureId: 'c-1', amount: 13000, adminUserId: 'admin-1' });
    const second = await ledger.refundClosure(owner, { closureId: 'c-1', amount: 13000, adminUserId: 'admin-1' });

    expect(second.kind).toBe('duplicate');
    expect(second.kind === 'duplicate' && first.kind === 'recorded' && second.movement.id === first.movement.id).toBe(true);
    expect(await balanceOf()).toBe(0);
  });

  it('refuses to return more than the balance holds', async () => {
    await credit(5000, 'k-1');
    expect(await ledger.refundClosure(owner, { closureId: 'c-1', amount: 13000, adminUserId: 'admin-1' })).toEqual({ kind: 'insufficient_funds', balance: 5000 });
    expect(await balanceOf()).toBe(5000);
  });

  it('forgives a debt with its reason, once, leaving the balance at zero', async () => {
    await ledger.applyPenalty(owner, { penaltyEventId: 'e-1', amount: 30000 });
    expect(await balanceOf()).toBe(-30000);

    const result = await ledger.waiveDebt(owner, { closureId: 'c-1', amount: 30000, reason: '  Error de cobro ', adminUserId: 'admin-1' });

    expect(result).toMatchObject({
      kind: 'recorded',
      movement: { type: 'debt_waiver', amount: 30000, causeKey: 'debt_waiver:c-1', reason: 'Error de cobro', references: { closureId: 'c-1' } },
    });
    expect(await balanceOf()).toBe(0);
    expect((await ledger.waiveDebt(owner, { closureId: 'c-1', amount: 30000, reason: 'Error de cobro', adminUserId: 'admin-1' })).kind).toBe('duplicate');
  });
});

describe('OperatingBalanceLedger — spec 031: each movement keeps the market it happened in', () => {
  const moved: LedgerOwner = { ...owner, marketId: 'city-medellin' };

  it("attributes adjustments and charges to the goalkeeper's market then", async () => {
    await credit(20000, 'k-1');
    await ledger.chargeCommission(owner, { bookingId: 'b-1', requestId: 'r-1', amount: 7000 });

    expect(store.movements().map((movement) => movement.marketId)).toEqual(['city-cali', 'city-cali']);
  });

  it('keeps the original market on what a refund or a reversal gives back, after the goalkeeper moved', async () => {
    await credit(20000, 'k-1');
    await ledger.chargeCommission(owner, { bookingId: 'b-1', requestId: 'r-1', amount: 7000 });
    await ledger.applyPenalty(owner, { penaltyEventId: 'e-1', amount: 3000 });

    await ledger.refundCommission(moved, { bookingId: 'b-1', requestId: 'r-1', cancellation: { by: 'client', at: new Date(OPERATING_BALANCE_NOW), reason: 'Lluvia' } });
    await ledger.reversePenalty(moved, { penaltyEventId: 'e-1', actor: { kind: 'admin', userId: 'admin-1' } });
    await ledger.adjust(moved, { adminUserId: 'admin-1', amount: 100, reason: 'Ajuste', operationKey: 'k-2' });

    expect(store.movements().map((movement) => [movement.type, movement.marketId])).toEqual([
      ['admin_adjustment', 'city-cali'],
      ['commission_charge', 'city-cali'],
      ['penalty', 'city-cali'],
      ['commission_refund', 'city-cali'],
      ['penalty_reversal', 'city-cali'],
      ['admin_adjustment', 'city-medellin'],
    ]);
  });
});
