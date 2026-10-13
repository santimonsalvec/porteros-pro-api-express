import { describe, expect, it } from 'vitest';
import { GetSystemParametersQuery } from '../../../../../src/application/features/system/queries/getSystemParameters/getSystemParametersQuery.js';
import { GetSystemParametersQueryHandler } from '../../../../../src/application/features/system/queries/getSystemParameters/getSystemParametersQueryHandler.js';
import { Country } from '../../../../../src/domain/countries/country.js';
import { FakeInvoicingSecrets } from '../../../../fakes/fakeInvoicingSecrets.js';
import { FakePaymentSecrets } from '../../../../fakes/fakePaymentSecrets.js';

const PARAMETERS = {
  values: [{ name: 'OFFER_MAX_REMINDERS', value: 3, isDefault: true }],
  secrets: [{ name: 'JWT_SIGNING_KEY', present: true }],
};

describe('GetSystemParametersQueryHandler (admin spec 008, US4)', () => {
  it("adds each configured country's credentials, present or missing, never their values", async () => {
    const invoicingSecrets = new FakeInvoicingSecrets();
    invoicingSecrets.credentials.clear();
    const handler = new GetSystemParametersQueryHandler({
      parameters: () => PARAMETERS,
      countries: { list: async () => ({ items: [new Country({ id: 'co', name: 'Colombia', dialCode: '+57', countryCode: 'CO' }), new Country({ id: 'pe', name: 'Perú', dialCode: '+51', countryCode: 'PE' })], totalItems: 2 }) },
      gatewaySettings: { getByCountry: async (id) => (id === 'co' ? ({ gateway: 'wompi' } as never) : null) },
      invoicingSettings: { getByCountry: async (id) => (id === 'co' ? ({ provider: 'siigo' } as never) : null) },
      paymentSecrets: new FakePaymentSecrets(),
      invoicingSecrets,
    });

    const result = await handler.handle(new GetSystemParametersQuery());

    expect(result).toEqual({
      ...PARAMETERS,
      countryCredentials: [
        { countryId: 'co', countryCode: 'CO', countryName: 'Colombia', gateway: { name: 'wompi', present: true }, invoicingProvider: { name: 'siigo', present: false } },
      ],
    });
    expect(JSON.stringify(result)).not.toMatch(/privateKey|integrity|accessKey|password/i);
  });
});
