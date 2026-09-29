import { describe, expect, it } from 'vitest';
import { EnvPaymentSecrets } from '../../../../src/infrastructure/payments/envPaymentSecrets.js';
import { PaymentGatewayRegistry } from '../../../../src/infrastructure/payments/gatewayRegistry.js';
import { WompiGateway } from '../../../../src/infrastructure/payments/wompiGateway.js';

const ENV = {
  WOMPI_CO_PRIVATE_KEY: 'prv_test_a',
  WOMPI_CO_EVENTS_SECRET: 'test_events_b',
  WOMPI_CO_INTEGRITY_SECRET: 'test_integrity_c',
};

describe('EnvPaymentSecrets', () => {
  it('reads the gateway secrets of a country', () => {
    expect(new EnvPaymentSecrets(ENV).forGateway('wompi', 'co')).toEqual({
      privateKey: 'prv_test_a',
      eventsSecret: 'test_events_b',
      integritySecret: 'test_integrity_c',
    });
  });

  it.each(['WOMPI_CO_PRIVATE_KEY', 'WOMPI_CO_EVENTS_SECRET', 'WOMPI_CO_INTEGRITY_SECRET'])('answers null without %s', (name) => {
    expect(new EnvPaymentSecrets({ ...ENV, [name]: ' ' }).forGateway('wompi', 'CO')).toBeNull();
  });

  it('answers null for a country without secrets', () => {
    expect(new EnvPaymentSecrets(ENV).forGateway('wompi', 'PE')).toBeNull();
  });
});

describe('PaymentGatewayRegistry', () => {
  it('finds a gateway by name', () => {
    const wompi = new WompiGateway();
    const registry = new PaymentGatewayRegistry([wompi]);

    expect(registry.get('wompi')).toBe(wompi);
    expect(registry.get('stripe')).toBeNull();
  });
});
