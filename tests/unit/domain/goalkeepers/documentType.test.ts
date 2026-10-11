import { describe, expect, it } from 'vitest';
import { DocumentType, INVOICEABLE_DOCUMENT_TYPE_CODES, isInvoiceableDocumentType } from '../../../../src/domain/goalkeepers/documentType.js';

describe('DocumentType revision', () => {
  it('defaults to 0 and keeps a stored value', () => {
    expect(new DocumentType({ id: 'cc', code: 'cedula_ciudadania', name: 'Cédula' }).revision).toBe(0);
    expect(new DocumentType({ id: 'cc', code: 'cedula_ciudadania', name: 'Cédula', revision: 1 }).revision).toBe(1);
  });

  it('rejects a broken revision', () => {
    expect(() => new DocumentType({ id: 'cc', code: 'cedula_ciudadania', name: 'Cédula', revision: -1 })).toThrow(
      /documentTypes document cc: revision/,
    );
  });
});

describe('INVOICEABLE_DOCUMENT_TYPE_CODES', () => {
  it('names the codes the invoicing provider accepts (business-settings §3.5)', () => {
    expect([...INVOICEABLE_DOCUMENT_TYPE_CODES].sort()).toEqual(['CC', 'CE', 'NIT', 'PA', 'cedula_ciudadania', 'cedula_extranjeria', 'nit', 'pasaporte'].sort());
    expect(isInvoiceableDocumentType('cedula_ciudadania')).toBe(true);
    expect(isInvoiceableDocumentType('tarjeta_identidad')).toBe(false);
  });
});
