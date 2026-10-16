import { describe, expect, it } from 'vitest';
import { needsAcknowledgement, warning } from '../../../../../src/application/features/geography/common/warnings.js';

describe('needsAcknowledgement', () => {
  const overlap = warning('document_type_not_invoiceable', { code: 'ti' });

  it('is false without warnings or once acknowledged', () => {
    expect(needsAcknowledgement([], false)).toBe(false);
    expect(needsAcknowledgement([overlap], true)).toBe(false);
  });

  it('is true with warnings not yet acknowledged', () => {
    expect(needsAcknowledgement([overlap], false)).toBe(true);
    expect(needsAcknowledgement([overlap], undefined)).toBe(true);
  });
});

describe('warning messages', () => {
  it.each([
    [
      'country_code_changes_secrets',
      { from: 'CO', to: 'EC' },
      'Los secretos de la pasarela y de la facturación se buscan por el código del país: pasarán de CO a EC',
    ],
    ['document_type_not_invoiceable', { code: 'ti' }, 'Las facturas de porteros con este tipo serán rechazadas'],
    ['required_setting_removed', { field: 'minNoticeMinutes', operatingMarkets: 2 }, '2 sedes dejarán de cotizar sin la anticipación mínima'],
  ] as const)('%s', (code, data, message) => {
    expect(warning(code, data).message).toBe(message);
  });
});
