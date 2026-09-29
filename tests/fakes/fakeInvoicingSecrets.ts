import type { IInvoicingSecrets, InvoicingCredentials } from '../../src/application/features/invoicing/common/ports.js';

export const TEST_INVOICING_CREDENTIALS: InvoicingCredentials = { username: 'api@porteros.test', accessKey: 'fake-siigo-access-key' };

/** Credentials per `provider:COUNTRY`; Colombia's Siigo credentials are there unless removed. */
export class FakeInvoicingSecrets implements IInvoicingSecrets {
  readonly credentials = new Map<string, InvoicingCredentials>([['siigo:CO', TEST_INVOICING_CREDENTIALS]]);

  forProvider(provider: string, countryCode: string): InvoicingCredentials | null {
    return this.credentials.get(`${provider}:${countryCode.toUpperCase()}`) ?? null;
  }
}
