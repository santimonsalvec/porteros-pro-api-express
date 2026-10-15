import { describe, expect, it } from 'vitest';
import {
  isGuardedDebit,
  BalanceMovement,
  type MovementType,
  type BalanceMovementProps,
} from '../../../../src/domain/operatingBalance/balanceMovement.js';
import { COLOMBIA_INVOICING } from '../../../fixtures/operatingBalanceFixtures.js';

function props(overrides: Partial<BalanceMovementProps> = {}): BalanceMovementProps {
  return {
    id: 'm-1',
    operatingBalanceId: 'gk-1',
    sequence: 1,
    type: 'deposit',
    amount: 20000,
    currency: 'COP',
    balanceAfter: 20000,
    occurredAt: new Date('2026-09-27T18:00:00.000Z'),
    causeKey: 'deposit:t-1',
    actor: { kind: 'system', userId: null },
    references: { depositId: 't-1' },
    cancellation: null,
    reason: null,
    invoicing: COLOMBIA_INVOICING,
    ...overrides,
  };
}

describe('BalanceMovement', () => {
  it.each<[MovementType, number, Partial<BalanceMovementProps>]>([
    ['deposit', 20000, {}],
    ['commission_charge', -7000, {}],
    ['commission_refund', 7000, { cancellation: { by: 'client', at: new Date(), reason: 'Un amigo tapa' } }],
    ['penalty', -7000, {}],
    ['penalty_reversal', 7000, {}],
    ['admin_adjustment', 50000, { reason: 'Saldo inicial de pruebas' }],
    ['admin_adjustment', -10000, { reason: 'Corrección' }],
    ['gateway_fee', -1500, { causeKey: 'gateway_fee:t-1' }],
    ['commission_vat', -1330, { taxRateBps: 1900 }],
    ['commission_vat_refund', 1330, { taxRateBps: 1900 }],
    ['penalty_vat', -1330, { taxRateBps: 1900 }],
    ['penalty_vat_reversal', 1330, { taxRateBps: 0 }],
    ['closure_refund', -13000, { causeKey: 'closure_refund:c-1', references: { closureId: 'c-1' } }],
    ['debt_waiver', 30000, { causeKey: 'debt_waiver:c-1', references: { closureId: 'c-1' }, reason: 'Error de cobro' }],
  ])('accepts a %s of %i', (type, amount, extra) => {
    expect(BalanceMovement.rehydrate(props({ type, amount, ...extra }))).toMatchObject({ type, amount });
  });

  it.each<[string, Partial<BalanceMovementProps>, RegExp]>([
    ['a zero amount', { amount: 0 }, /amount/],
    ['a fractional amount', { amount: 1.5 }, /amount/],
    ['a negative deposit', { amount: -1 }, /positive/],
    ['a positive commission charge', { type: 'commission_charge', amount: 7000 }, /negative/],
    ['a positive penalty', { type: 'penalty', amount: 7000 }, /negative/],
    ['a positive gateway fee', { type: 'gateway_fee', amount: 1500 }, /negative/],
    ['a positive closure refund', { type: 'closure_refund', amount: 13000 }, /negative/],
    ['a negative debt waiver', { type: 'debt_waiver', amount: -30000, reason: 'Error de cobro' }, /positive/],
    ['a debt waiver without a reason', { type: 'debt_waiver', amount: 30000, reason: null }, /reason/],
    ['a reason on a closure refund', { type: 'closure_refund', amount: -13000, reason: 'x' }, /reason/],
    ['a positive commission VAT', { type: 'commission_vat', amount: 1330, taxRateBps: 1900 }, /negative/],
    ['a VAT movement without its rate', { type: 'commission_vat', amount: -1330 }, /taxRateBps/],
    ['a VAT rate above 100 %', { type: 'penalty_vat', amount: -1330, taxRateBps: 10001 }, /taxRateBps/],
    ['a rate outside a VAT movement', { taxRateBps: 1900 }, /taxRateBps/],
    ['a lower-case currency', { currency: 'cop' }, /currency/],
    ['a sequence of 0', { sequence: 0 }, /sequence/],
    ['cancellation details outside a refund', { cancellation: { by: 'client', at: new Date(), reason: 'x' } }, /cancellation/],
    ['an adjustment without a reason', { type: 'admin_adjustment', reason: '  ' }, /reason/],
    ['a reason outside an adjustment', { reason: 'porque sí' }, /reason/],
    ['an empty cause key', { causeKey: '' }, /causeKey/],
  ])('rejects %s', (_label, change, message) => {
    expect(() => BalanceMovement.rehydrate(props(change))).toThrow(message);
  });

  it('guards every debit except penalties and gateway fees, and never credits', () => {
    expect(isGuardedDebit('commission_charge', -7000)).toBe(true);
    expect(isGuardedDebit('admin_adjustment', -10000)).toBe(true);
    expect(isGuardedDebit('penalty', -7000)).toBe(false);
    expect(isGuardedDebit('gateway_fee', -1500)).toBe(false);
    expect(isGuardedDebit('penalty_vat', -1330)).toBe(false);
    expect(isGuardedDebit('commission_vat', -1330)).toBe(true);
    expect(isGuardedDebit('admin_adjustment', 10000)).toBe(false);
    expect(isGuardedDebit('deposit', 20000)).toBe(false);
  });
});
