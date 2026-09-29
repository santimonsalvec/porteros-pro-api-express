import { describe, expect, it } from 'vitest';
import {
  isGuardedDebit,
  WalletMovement,
  type MovementType,
  type WalletMovementProps,
} from '../../../../src/domain/wallet/walletMovement.js';
import { COLOMBIA_INVOICING } from '../../../fixtures/walletFixtures.js';

function props(overrides: Partial<WalletMovementProps> = {}): WalletMovementProps {
  return {
    id: 'm-1',
    walletId: 'gk-1',
    sequence: 1,
    type: 'top_up',
    amount: 20000,
    currency: 'COP',
    balanceAfter: 20000,
    occurredAt: new Date('2026-09-27T18:00:00.000Z'),
    causeKey: 'top_up:t-1',
    actor: { kind: 'system', userId: null },
    references: { topUpId: 't-1' },
    cancellation: null,
    reason: null,
    invoicing: COLOMBIA_INVOICING,
    ...overrides,
  };
}

describe('WalletMovement', () => {
  it.each<[MovementType, number, Partial<WalletMovementProps>]>([
    ['top_up', 20000, {}],
    ['commission_charge', -7000, {}],
    ['commission_refund', 7000, { cancellation: { by: 'client', at: new Date(), reason: 'Un amigo tapa' } }],
    ['penalty', -7000, {}],
    ['penalty_reversal', 7000, {}],
    ['admin_adjustment', 50000, { reason: 'Saldo inicial de pruebas' }],
    ['admin_adjustment', -10000, { reason: 'Corrección' }],
    ['gateway_fee', -1500, { causeKey: 'gateway_fee:t-1' }],
  ])('accepts a %s of %i', (type, amount, extra) => {
    expect(WalletMovement.rehydrate(props({ type, amount, ...extra }))).toMatchObject({ type, amount });
  });

  it.each<[string, Partial<WalletMovementProps>, RegExp]>([
    ['a zero amount', { amount: 0 }, /amount/],
    ['a fractional amount', { amount: 1.5 }, /amount/],
    ['a negative top-up', { amount: -1 }, /positive/],
    ['a positive commission charge', { type: 'commission_charge', amount: 7000 }, /negative/],
    ['a positive penalty', { type: 'penalty', amount: 7000 }, /negative/],
    ['a positive gateway fee', { type: 'gateway_fee', amount: 1500 }, /negative/],
    ['a lower-case currency', { currency: 'cop' }, /currency/],
    ['a sequence of 0', { sequence: 0 }, /sequence/],
    ['cancellation details outside a refund', { cancellation: { by: 'client', at: new Date(), reason: 'x' } }, /cancellation/],
    ['an adjustment without a reason', { type: 'admin_adjustment', reason: '  ' }, /reason/],
    ['a reason outside an adjustment', { reason: 'porque sí' }, /reason/],
    ['an empty cause key', { causeKey: '' }, /causeKey/],
  ])('rejects %s', (_label, change, message) => {
    expect(() => WalletMovement.rehydrate(props(change))).toThrow(message);
  });

  it('guards every debit except penalties and gateway fees, and never credits', () => {
    expect(isGuardedDebit('commission_charge', -7000)).toBe(true);
    expect(isGuardedDebit('admin_adjustment', -10000)).toBe(true);
    expect(isGuardedDebit('penalty', -7000)).toBe(false);
    expect(isGuardedDebit('gateway_fee', -1500)).toBe(false);
    expect(isGuardedDebit('admin_adjustment', 10000)).toBe(false);
    expect(isGuardedDebit('top_up', 20000)).toBe(false);
  });
});
