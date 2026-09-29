import { describe, expect, it } from 'vitest';
import { InvoicingSettings } from '../../../../src/domain/invoicing/invoicingSettings.js';
import { InvalidConfigurationError } from '../../../../src/domain/pricing/invalidConfigurationError.js';

const CONFIG = {
  partnerId: 'PorterosPRO',
  invoiceDocumentId: 24446,
  creditNoteDocumentId: 24447,
  sellerId: 629,
  commissionProductCode: 'COMISION',
  penaltyProductCode: 'PENALIDAD',
  vatTaxId: 13156,
  paymentMethodId: 5636,
};
const props = (config: Record<string, unknown> = CONFIG, provider = 'siigo') => ({
  countryId: 'country-co',
  provider: provider as 'siigo',
  config,
  updatedAt: new Date(),
  updatedBy: 'admin-1',
});

describe('InvoicingSettings', () => {
  it('accepts Siigo with its complete configuration', () => {
    expect(InvoicingSettings.create(props()).ok).toBe(true);
  });

  it.each<[string, ReturnType<typeof props>, RegExp]>([
    ['an unsupported provider', props(CONFIG, 'alegra'), /provider/],
    ['a missing field', props({ ...CONFIG, sellerId: undefined }), /sellerId/],
    ['a non-integer id', props({ ...CONFIG, vatTaxId: 'IVA' }), /vatTaxId/],
    ['an empty product code', props({ ...CONFIG, commissionProductCode: ' ' }), /commissionProductCode/],
    ['a secret-like extra key', props({ ...CONFIG, accessKey: 'xyz' }), /accessKey/],
  ])('refuses %s', (_label, input, message) => {
    const created = InvoicingSettings.create(input);

    expect(created.ok).toBe(false);
    if (!created.ok) expect(created.problems.join('\n')).toMatch(message);
  });

  it('raises a configuration error for a malformed stored document', () => {
    expect(() => InvoicingSettings.rehydrate(props({}))).toThrow(InvalidConfigurationError);
  });
});
