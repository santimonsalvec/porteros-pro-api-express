import { describe, expect, it } from 'vitest';
import { EnvInvoicingSecrets } from '../../../../src/infrastructure/invoicing/envInvoicingSecrets.js';
import { InvoicingProviderRegistry } from '../../../../src/infrastructure/invoicing/invoicingProviderRegistry.js';
import { SiigoInvoicingProvider } from '../../../../src/infrastructure/invoicing/siigoInvoicingProvider.js';

describe('EnvInvoicingSecrets', () => {
  const env = { SIIGO_CO_USERNAME: 'api@porteros.co', SIIGO_CO_ACCESS_KEY: 'key' };

  it('reads a provider\'s credentials for a country', () => {
    expect(new EnvInvoicingSecrets(env).forProvider('siigo', 'co')).toEqual({ username: 'api@porteros.co', accessKey: 'key' });
  });

  it('answers null when any is missing, or for another country', () => {
    expect(new EnvInvoicingSecrets({ ...env, SIIGO_CO_ACCESS_KEY: ' ' }).forProvider('siigo', 'CO')).toBeNull();
    expect(new EnvInvoicingSecrets(env).forProvider('siigo', 'MX')).toBeNull();
  });
});

describe('InvoicingProviderRegistry', () => {
  it('finds a provider by name', () => {
    const siigo = new SiigoInvoicingProvider('https://api.siigo.com');

    expect(new InvoicingProviderRegistry([siigo]).get('siigo')).toBe(siigo);
    expect(new InvoicingProviderRegistry([siigo]).get('alegra')).toBeNull();
  });
});
