import { describe, expect, it } from 'vitest';
import { canTransition, newTopUpReference, nextCheckAfter, TopUp, type TopUpStatus } from '../../../../src/domain/payments/topUp.js';

const NOW = new Date('2026-09-29T12:00:00.000Z');
const minutes = (count: number): Date => new Date(NOW.getTime() + count * 60_000);

function started(): TopUp {
  return TopUp.start({
    id: '01928f3a-7b2c-7d4e-8f90-123456789abc',
    goalkeeperId: 'gk-1',
    countryId: 'country-co',
    gateway: 'wompi',
    environment: 'sandbox',
    amount: 20000,
    cost: 1464,
    currency: 'COP',
    now: NOW,
  });
}

describe('TopUp', () => {
  it('starts pending, with its reference, its net and a first check 15 minutes later', () => {
    const topUp = started();

    expect(topUp).toMatchObject({
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
    expect(topUp.nextCheckAt).toEqual(minutes(15));
  });

  it('refuses a cost that leaves nothing', () => {
    expect(() => TopUp.start({ ...started().toProps(), cost: 20000, now: NOW })).toThrow(/net/);
  });

  it('finalizes: the status, the transaction and no further checks', () => {
    const topUp = started().finalize('approved', 'tx-1', minutes(3));

    expect(topUp).toMatchObject({ status: 'approved', gatewayTransactionId: 'tx-1', finalizedAt: minutes(3), nextCheckAt: null });
  });

  it('keeps a known transaction id when the final answer has none', () => {
    const topUp = TopUp.rehydrate({ ...started().toProps(), gatewayTransactionId: 'tx-1' }).finalize('expired', null, minutes(2880));

    expect(topUp.gatewayTransactionId).toBe('tx-1');
  });
});

describe('canTransition', () => {
  it.each<[TopUpStatus, TopUpStatus, boolean]>([
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
  const topUp = { createdAt: NOW };

  it.each<[number, number]>([
    [15, 60],
    [59, 60],
    [60, 360],
    [360, 1440],
    [1440, 2880],
  ])('after the check at %i minutes, the next is at %i', (checkedAt, next) => {
    expect(nextCheckAfter(topUp, minutes(checkedAt))).toEqual(minutes(next));
  });

  it('expires at 48 hours', () => {
    expect(nextCheckAfter(topUp, minutes(2880))).toBe('expire');
    expect(nextCheckAfter(topUp, minutes(4000))).toBe('expire');
  });
});

describe('newTopUpReference', () => {
  it('drops the dashes', () => {
    expect(newTopUpReference('a-b-c')).toBe('PPR-abc');
  });
});
