import type { IClock } from '../../../common/clock.js';
import type { InvoicingDocument } from '../../../../domain/invoicing/invoicingDocument.js';
import type { IUserRepository } from '../../auth/common/ports.js';
import { personNames } from '../../goalkeeperRequests/common/adminNames.js';
import type { PersonRef } from '../../goalkeeperRequests/common/adminViews.js';
import type { ICountryLookup } from '../../goalkeeperRequests/common/ports.js';
import type { IInvoicingDocumentAdminReader } from './adminPorts.js';
import { toAdminDocumentItem, type AdminDocumentItemResponse } from './documentResponses.js';
import type { IInvoicingDocumentRepository } from './ports.js';

export interface DocumentAdminDependencies {
  reader: IInvoicingDocumentAdminReader;
  documents: Pick<IInvoicingDocumentRepository, 'getById'>;
  users: Pick<IUserRepository, 'getByIds'>;
  countries: ICountryLookup;
  clock: IClock;
  /** `INVOICING_ENABLED`: off, documents are created and wait (feature 023). */
  issuingEnabled: boolean;
}

/** A row of Finanzas → Facturación: the list's item as before, plus who it is for (admin spec 007). */
export interface DocumentAdminRow extends AdminDocumentItemResponse {
  goalkeeper: PersonRef;
}

/** Another document this one is tied to (a credit note's invoice, an invoice's credit notes). */
export interface RelatedDocument {
  documentId: string;
  kind: InvoicingDocument['kind'];
  number: string | null;
  status: InvoicingDocument['status'];
}

export interface DocumentAdminDetail extends DocumentAdminRow {
  nextAttemptAt: string | null;
  waitingFor: string | null;
  requestId: string | null;
  original: RelatedDocument | null;
  creditNotes: RelatedDocument[];
}

export function relatedOf(document: InvoicingDocument): RelatedDocument {
  return { documentId: document.id, kind: document.kind, number: document.provider?.number ?? null, status: document.status };
}

export async function documentRows(deps: Pick<DocumentAdminDependencies, 'users'>, documents: readonly InvoicingDocument[], now: Date): Promise<DocumentAdminRow[]> {
  const people = await personNames(deps, documents.map((document) => document.goalkeeperId));
  return documents.map((document) => ({ ...toAdminDocumentItem(document, now), goalkeeper: people(document.goalkeeperId) }));
}

/** Why a document was rejected, in words for people (contracts/finance-ui.md); the provider's text otherwise. */
export const REJECTION_REASONS: Readonly<Record<string, string>> = {
  buyer_city_not_coded: 'La ciudad del portero no tiene códigos DANE',
  buyer_document_type_unsupported: 'El tipo de documento del portero no lo acepta el proveedor',
  provider_not_configured: 'Este país no tiene proveedor de facturación',
  provider_credentials_missing: 'Faltan las credenciales del proveedor en Secret Manager',
  provider_not_supported: 'El proveedor configurado no está soportado',
  authority_rejected: 'La DIAN rechazó el documento',
  original_not_issued: 'La factura original aún no está emitida',
};
