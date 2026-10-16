import { describe, expect, it } from 'vitest';
import { canTransition, newDepositReference, nextCheckAfter, Deposit, type DepositStatus } from '../../../../src/domain/deposits/deposit.js';

const NOW = new Date('2026-09-29T12:00:00.000Z');
const minutes = (count: number): Date => new Date(NOW.getTime() + count * 60_000);

function started(): Deposit {
  return Deposit.start({
    id: '01928f3a-7b2c-7d4e-8f90-123456789abc',
    goalkeeperId: 'gk-1',
    countryId: 'country-co', marketId: 'city-cali',
    gateway: 'wompi',
    environment: 'sandbox',
    amount: 20000,
    cost: 1464,
    currency: 'COP',
    now: NOW,
  });
}

describe('Deposit', () => {
  it('starts pending, with its reference, its net and a first check 15 minutes later', () => {
    const deposit = started();

    expect(deposit).toMatchObject({
      status: 'pending',
      reference: 'PPR-01928f3a7b2c7d4e8f90123456789abc',
      amount: 20000,
      cost: 1464,
      net: 18536,
      gateway: 'wompi',
      checks: 0,
      finalizedAt: null,
      gatewayTransactionId: null,
    });
    expect(deposit.nextCheckAt).toEqual(minutes(15));
  });

  it('refuses a cost that leaves nothing', () => {
    expect(() => Deposit.start({ ...started().toProps(), cost: 20000, now: NOW })).toThrow(/net/);
  });

  it('refuses malformed stored data on rehydrate', () => {
    const props = started().toProps();
    expect(() => Deposit.rehydrate({ ...props, amount: 0 })).toThrow(/amount/);
    expect(() => Deposit.rehydrate({ ...props, amount: 20000.5 })).toThrow(/amount/);
    expect(() => Deposit.rehydrate({ ...props, cost: -1 })).toThrow(/cost/);
    expect(() => Deposit.rehydrate({ ...props, net: 1 })).toThrow(/net/);
    expect(() => Deposit.rehydrate({ ...props, currency: 'cop' })).toThrow(/currency/);
    expect(() => Deposit.rehydrate({ ...props, status: 'paid' as DepositStatus })).toThrow(/status/);
    expect(() => Deposit.rehydrate({ ...props, environment: 'staging' as 'sandbox' })).toThrow(/environment/);
  });

  it('finalizes: the status, the transaction and no further checks', () => {
    const deposit = started().finalize('approved', 'tx-1', minutes(3));

    expect(deposit).toMatchObject({ status: 'approved', gatewayTransactionId: 'tx-1', finalizedAt: minutes(3), nextCheckAt: null });
  });

  it('keeps a known transaction id when the final answer has none', () => {
    const deposit = Deposit.rehydrate({ ...started().toProps(), gatewayTransactionId: 'tx-1' }).finalize('expired', null, minutes(2880));

    expect(deposit.gatewayTransactionId).toBe('tx-1');
  });
});

describe('canTransition', () => {
  it.each<[DepositStatus, DepositStatus, boolean]>([
    ['pending', 'approved', true],
    ['pending', 'declined', true],
    ['pending', 'voided', true],
    ['pending', 'error', true],
    ['pending', 'expired', true],
    ['pending', 'pending', false],
    ['expired', 'approved', true],
    ['expired', 'declined', false],
    ['approved', 'declined', false],
    ['approved', 'approved', false],
    ['declined', 'approved', false],
  ])('%s → %s is %s', (from, to, allowed) => {
    expect(canTransition(from, to)).toBe(allowed);
  });
});

describe('nextCheckAfter', () => {
  const deposit = { createdAt: NOW };

  it.each<[number, number]>([
    [15, 60],
    [59, 60],
    [60, 360],
    [360, 1440],
    [1440, 2880],
  ])('after the check at %i minutes, the next is at %i', (checkedAt, next) => {
    expect(nextCheckAfter(deposit, minutes(checkedAt))).toEqual(minutes(next));
  });

  it('expires at 48 hours', () => {
    expect(nextCheckAfter(deposit, minutes(2880))).toBe('expire');
    expect(nextCheckAfter(deposit, minutes(4000))).toBe('expire');
  });
});

describe('newDepositReference', () => {
  it('drops the dashes', () => {
    expect(newDepositReference('a-b-c')).toBe('PPR-abc');
  });
});

describe('Deposit market (spec 031, FR-043)', () => {
  it('keeps the market the goalkeeper played in when it started', () => {
    expect(started().marketId).toBe('city-cali');
    expect(started().toProps().marketId).toBe('city-cali');
  });
});
