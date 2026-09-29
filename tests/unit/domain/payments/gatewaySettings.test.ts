import { describe, expect, it } from 'vitest';
import { costFor, PaymentGatewaySettings, type PaymentGatewaySettingsProps } from '../../../../src/domain/payments/gatewaySettings.js';
import { InvalidConfigurationError } from '../../../../src/domain/pricing/invalidConfigurationError.js';

const COSTS = { percentBps: 265, fixed: 700, vatBps: 1900 };

function props(overrides: Partial<PaymentGatewaySettingsProps> = {}): PaymentGatewaySettingsProps {
  return {
    countryId: 'country-co',
    gateway: 'wompi',
    publicConfig: { publicKey: 'pub_test_abc', environment: 'sandbox' },
    currency: 'COP',
    costs: COSTS,
    amounts: [50000, 10000, 20000],
    updatedAt: new Date('2026-09-29T12:00:00.000Z'),
    updatedBy: 'admin-1',
    ...overrides,
  };
}

describe('costFor', () => {
  it('charges the percentage plus the fixed part, with VAT on both, rounded up', () => {
    // (20 000 × 2.65 % + 700) × 1.19 = 1 463.7 → 1 464
    expect(costFor(20000, COSTS)).toBe(1464);
    // (10 000 × 2.65 % + 700) × 1.19 = 1 148.35 → 1 149
    expect(costFor(10000, COSTS)).toBe(1149);
  });

  it('never rounds an exact value up', () => {
    expect(costFor(10000, { percentBps: 100, fixed: 0, vatBps: 0 })).toBe(100);
    expect(costFor(10000, { percentBps: 0, fixed: 0, vatBps: 0 })).toBe(0);
  });

  it('rounds up any fraction, however small', () => {
    expect(costFor(10001, { percentBps: 100, fixed: 0, vatBps: 0 })).toBe(101);
  });
});

describe('PaymentGatewaySettings', () => {
  it('sorts the amounts and offers each with its cost and net', () => {
    const created = PaymentGatewaySettings.create(props());

    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.settings.countryId).toBe('country-co');
    expect(created.settings.options()).toEqual([
      { amount: 10000, cost: 1149, net: 8851 },
      { amount: 20000, cost: 1464, net: 18536 },
      { amount: 50000, cost: 2410, net: 47590 },
    ]);
  });

  it('accepts a production key in production', () => {
    expect(PaymentGatewaySettings.create(props({ publicConfig: { publicKey: 'pub_prod_x', environment: 'production' } })).ok).toBe(true);
  });

  it.each<[string, Partial<PaymentGatewaySettingsProps>, RegExp]>([
    ['an unsupported gateway', { gateway: 'stripe' as never }, /gateway/],
    ['a production key in sandbox', { publicConfig: { publicKey: 'pub_prod_x', environment: 'sandbox' } }, /pub_test_/],
    ['a sandbox key in production', { publicConfig: { publicKey: 'pub_test_x', environment: 'production' } }, /pub_prod_/],
    ['an unknown environment', { publicConfig: { publicKey: 'pub_test_x', environment: 'staging' as never } }, /environment/],
    ['a lower-case currency', { currency: 'cop' }, /currency/],
    ['a percentage above 100 %', { costs: { ...COSTS, percentBps: 10001 } }, /costs/],
    ['a negative fixed cost', { costs: { ...COSTS, fixed: -1 } }, /costs/],
    ['a fractional VAT', { costs: { ...COSTS, vatBps: 19.5 } }, /costs/],
    ['no amounts', { amounts: [] }, /amounts/],
    ['eleven amounts', { amounts: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((n) => n * 10000) }, /amounts/],
    ['a zero amount', { amounts: [0, 10000] }, /positive/],
    ['a fractional amount', { amounts: [10000.5] }, /positive/],
    ['a repeated amount', { amounts: [10000, 10000] }, /distinct/],
    ['an amount the cost eats', { amounts: [800, 10000] }, /800/],
  ])('refuses %s', (_label, change, message) => {
    const created = PaymentGatewaySettings.create(props(change));

    expect(created.ok).toBe(false);
    if (created.ok) return;
    expect(created.problems.join('\n')).toMatch(message);
  });

  it('raises a configuration error for a malformed stored document', () => {
    expect(() => PaymentGatewaySettings.rehydrate(props({ amounts: [] }))).toThrow(InvalidConfigurationError);
  });
});
