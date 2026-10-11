import { Entity } from '../common/entity.js';
import { readRevision } from '../common/revision.js';

/**
 * A single accepted kind of identification document (spec Key Entities). Manually
 * seeded, read-only reference data from this system's perspective — mirrors
 * `Country`/`domain/countries/country.ts`.
 */
export class DocumentType extends Entity<string> {
  readonly code: string;
  readonly name: string;
  /** Edit counter for the admin's optimistic concurrency; 0 when never edited there. */
  readonly revision: number;

  constructor(params: { id: string; code: string; name: string; revision?: number }) {
    super(params.id);
    this.code = params.code;
    this.name = params.name;
    this.revision = readRevision(params.revision, `documentTypes document ${params.id}`);
  }
}

/**
 * The document type codes the invoicing provider accepts (business-settings §3.5): any other
 * leaves a goalkeeper's invoices rejected (`buyer_document_type_unsupported`). The Siigo adapter
 * maps exactly these (a test keeps both in step).
 */
export const INVOICEABLE_DOCUMENT_TYPE_CODES: readonly string[] = [
  'cedula_ciudadania',
  'CC',
  'cedula_extranjeria',
  'CE',
  'pasaporte',
  'PA',
  'nit',
  'NIT',
];

export function isInvoiceableDocumentType(code: string): boolean {
  return INVOICEABLE_DOCUMENT_TYPE_CODES.includes(code);
}
