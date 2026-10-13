import type { IQueryHandler } from '../../../../common/mediator/types.js';
import { EXPORT_LIMIT, EXPORT_TIME_ZONE, exportDateTime } from '../../../../common/exportFormat.js';
import { toCsv } from '../../../../../domain/common/csv.js';
import type { InvoicingDocument } from '../../../../../domain/invoicing/invoicingDocument.js';
import { personNames } from '../../../goalkeeperRequests/common/adminNames.js';
import { REJECTION_REASONS, type DocumentAdminDependencies } from '../../common/documentAdminViews.js';
import { ExportDocumentsQuery, type ExportDocumentsResult } from './exportDocumentsQuery.js';

const COLUMNS = [
  'fecha', 'zona_horaria', 'tipo', 'concepto', 'numero', 'cufe', 'estado', 'portero', 'portero_id', 'pais', 'base', 'iva',
  'tarifa_iva', 'total', 'moneda', 'motivo_rechazo', 'factura_original',
] as const;

const KIND: Record<InvoicingDocument['kind'], string> = { invoice: 'Factura', credit_note: 'Nota crédito' };
const CONCEPT: Record<InvoicingDocument['concept'], string> = { commission: 'Comisión', penalty: 'Penalidad' };
const STATUS: Record<InvoicingDocument['status'], string> = {
  pending: 'Pendiente',
  awaiting_authority: 'Esperando a la DIAN',
  issued: 'Emitido',
  rejected: 'Rechazado',
};

/** Never the buyer's identity document nor their email: the file leaves the platform (FR-024). */
export class ExportDocumentsQueryHandler implements IQueryHandler<ExportDocumentsQuery, ExportDocumentsResult> {
  constructor(private readonly deps: Pick<DocumentAdminDependencies, 'reader' | 'documents' | 'users' | 'countries' | 'clock'>) {}

  async handle({ filter }: ExportDocumentsQuery): Promise<ExportDocumentsResult> {
    const now = this.deps.clock.now();
    const count = await this.deps.reader.count(filter, now);
    if (count > EXPORT_LIMIT) return { outcome: 'too_large', count, limit: EXPORT_LIMIT };
    const documents = await this.deps.reader.all(filter, now, EXPORT_LIMIT);

    const originalIds = [...new Set(documents.flatMap((document) => (document.originalDocumentId ? [document.originalDocumentId] : [])))];
    const countryIds = [...new Set(documents.map((document) => document.countryId))];
    const [people, originals, countries] = await Promise.all([
      personNames(this.deps, documents.map((document) => document.goalkeeperId)),
      Promise.all(originalIds.map((id) => this.deps.documents.getById(id))),
      Promise.all(countryIds.map((id) => this.deps.countries.getById(id))),
    ]);
    const originalNumbers = new Map(originals.filter((original) => original !== null).map((original) => [original.id, original.provider?.number ?? original.id]));
    const countryNames = new Map(countries.filter((country) => country !== null).map((country) => [country.id, country.name]));

    const rows = documents.map((document) => ({
      fecha: exportDateTime(document.occurredAt),
      zona_horaria: EXPORT_TIME_ZONE,
      tipo: KIND[document.kind],
      concepto: CONCEPT[document.concept],
      numero: document.provider?.number ?? null,
      cufe: document.provider?.cufe ?? null,
      estado: STATUS[document.status],
      portero: people(document.goalkeeperId).name,
      portero_id: document.goalkeeperId,
      pais: countryNames.get(document.countryId) ?? null,
      base: document.base,
      iva: document.vat,
      tarifa_iva: document.vatRateBps / 100,
      total: document.total,
      moneda: document.currency,
      motivo_rechazo: document.status === 'rejected' && document.lastError ? (REJECTION_REASONS[document.lastError.code] ?? document.lastError.message) : null,
      factura_original: document.originalDocumentId ? (originalNumbers.get(document.originalDocumentId) ?? document.originalDocumentId) : null,
    }));
    return { outcome: 'ok', csv: toCsv(COLUMNS, rows), rows: rows.length };
  }
}
