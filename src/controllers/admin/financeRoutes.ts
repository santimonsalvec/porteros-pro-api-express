import type { Request, Response } from 'express';
import type { ISender } from '../../application/common/mediator/types.js';
import { exportDateTime } from '../../application/common/exportFormat.js';
import { RetryDocumentCommand } from '../../application/features/invoicing/commands/retryDocument/retryDocumentCommand.js';
import { ExportDocumentsQuery } from '../../application/features/invoicing/queries/exportDocuments/exportDocumentsQuery.js';
import { GetDocumentAdminQuery } from '../../application/features/invoicing/queries/getDocumentAdmin/getDocumentAdminQuery.js';
import { GetDocumentFileQuery } from '../../application/features/invoicing/queries/getDocumentFile/getDocumentFileQuery.js';
import { ListDocumentsForAdminQuery } from '../../application/features/invoicing/queries/listDocumentsForAdmin/listDocumentsForAdminQuery.js';
import { ListWalletsAdminQuery } from '../../application/features/wallet/queries/listWalletsAdmin/listWalletsAdminQuery.js';
import { ReconcileTopUpCommand } from '../../application/features/payments/commands/reconcileTopUp/reconcileTopUpCommand.js';
import { ExportTopUpsQuery } from '../../application/features/payments/queries/exportTopUps/exportTopUpsQuery.js';
import { GetTopUpAdminQuery } from '../../application/features/payments/queries/getTopUpAdmin/getTopUpAdminQuery.js';
import { ListTopUpsAdminQuery } from '../../application/features/payments/queries/listTopUpsAdmin/listTopUpsAdminQuery.js';
import { ApiError } from '../apiError.js';
import { exportDocumentsQuerySchema, listDocumentsAdminQuerySchema } from '../requests/finance/invoicingDocumentRequests.js';
import { exportTopUpsQuerySchema, listTopUpsQuerySchema } from '../requests/finance/topUpRequests.js';
import { listWalletsQuerySchema } from '../requests/finance/walletRequests.js';
import { parse, type Route } from './geographyRoutes.js';

const topUpNotFound = () => new ApiError(404, 'top_up_not_found', 'No top-up exists with this id.');

/** The filters an export was asked with, as they came (strings), for its audit entry. */
function filtersOf(req: Request, keys: readonly string[]): Record<string, unknown> {
  const query = req.query as Record<string, unknown>;
  return Object.fromEntries(keys.filter((key) => query[key] !== undefined).map((key) => [key, query[key]]));
}

/** A CSV download (admin spec 007, research §7): never cached, named after today in Colombia. */
function sendCsv(res: Response, name: string, csv: string): void {
  const today = exportDateTime(new Date()).slice(0, 10);
  res
    .status(200)
    .set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}-${today}.csv"`, 'Cache-Control': 'private, no-store' })
    .send(csv);
}

const exportTooLarge = (count: number, limit: number) =>
  new ApiError(422, 'export_too_large', 'Too many rows to export; narrow the filters.', undefined, { count, limit });

/**
 * Money in the admin web (spec 007 of the admin, contracts/finance-api.md): wallets, top-ups and
 * invoicing documents. A literal segment (`export`) is declared before the `:id` beside it.
 */
export function registerFinanceRoutes(route: Route, mediator: ISender): void {
  route('get', '/wallets', 'wallets.read', async (req, res) => {
    const result = await mediator.send(new ListWalletsAdminQuery(parse(listWalletsQuerySchema, req.query)));
    res.status(200).json(result.page);
  });
  registerTopUpRoutes(route, mediator);
  registerDocumentRoutes(route, mediator);
}

function registerTopUpRoutes(route: Route, mediator: ISender): void {
  const TOP_UP_FILTERS = ['status', 'countryId', 'goalkeeperId', 'from', 'to'] as const;

  route('get', '/top-ups', 'topups.read', async (req, res) => {
    const result = await mediator.send(new ListTopUpsAdminQuery(parse(listTopUpsQuerySchema, req.query)));
    res.status(200).json(result.page);
  });

  route(
    'get',
    '/top-ups/export',
    { permission: 'topups.read', read: { action: 'topUps.export', resourceType: 'topUps', resourceId: () => 'export' } },
    async (req, res) => {
      const filter = parse(exportTopUpsQuerySchema, req.query);
      const result = await mediator.send(new ExportTopUpsQuery(filter));
      if (result.outcome === 'too_large') {
        res.locals.auditRequest = filtersOf(req, TOP_UP_FILTERS);
        throw exportTooLarge(result.count, result.limit);
      }
      res.locals.auditRequest = { ...filtersOf(req, TOP_UP_FILTERS), rows: result.rows };
      sendCsv(res, 'recargas', result.csv);
    },
  );

  route('get', '/top-ups/:topUpId', 'topups.read', async (req, res) => {
    const result = await mediator.send(new GetTopUpAdminQuery(req.params.topUpId));
    if (result.outcome === 'not_found') throw topUpNotFound();
    res.status(200).json(result.topUp);
  });

  route(
    'post',
    '/top-ups/:topUpId/reconcile',
    { permission: 'topups.reconcile', audit: { action: 'topUp.reconcile', resourceType: 'topUp', resourceId: (req) => String(req.params.topUpId) } },
    async (req, res) => {
      const result = await mediator.send(new ReconcileTopUpCommand(req.adminAccess!.userId, req.params.topUpId));
      const detail = async () => {
        const read = await mediator.send(new GetTopUpAdminQuery(req.params.topUpId));
        if (read.outcome === 'not_found') throw topUpNotFound();
        return read.topUp;
      };
      // Exhaustive on purpose: adding an outcome without mapping it here fails compilation.
      switch (result.outcome) {
        case 'reconciled':
          res.status(200).json({ outcome: 'reconciled', answer: result.answer, status: result.status, topUp: await detail() });
          return;
        case 'already_final':
          res.locals.auditOutcome = 'replayed';
          res.status(200).json({ outcome: 'already_final', status: result.topUp.status, topUp: await detail() });
          return;
        case 'gateway_unavailable':
          res.status(200).json({ outcome: 'gateway_unavailable', status: result.topUp.status, topUp: await detail() });
          return;
        case 'in_progress':
          throw new ApiError(409, 'reconcile_in_progress', 'Another check of this top-up is in progress.');
        case 'credentials_missing':
          throw new ApiError(409, 'gateway_unavailable', "The gateway or its credentials are missing for the top-up's country.");
        case 'not_found':
          throw topUpNotFound();
      }
    },
  );
}

const documentNotFound = () => new ApiError(404, 'invoicing_document_not_found', 'No invoicing document exists with this id.');

/** Invoices and credit notes (feature 023's list and retry, moved here; admin spec 007 adds the rest). */
function registerDocumentRoutes(route: Route, mediator: ISender): void {
  const DOCUMENT_FILTERS = ['status', 'kind', 'countryId', 'from', 'to', 'stale'] as const;

  route('get', '/invoicing/documents', 'invoicing.read', async (req, res) => {
    const { status, page, pageSize, ...filters } = parse(listDocumentsAdminQuerySchema, req.query);
    res.status(200).json(await mediator.send(new ListDocumentsForAdminQuery(status ?? null, page, pageSize, filters)));
  });

  route(
    'get',
    '/invoicing/documents/export',
    { permission: 'invoicing.read', read: { action: 'invoicingDocuments.export', resourceType: 'invoicingDocuments', resourceId: () => 'export' } },
    async (req, res) => {
      const result = await mediator.send(new ExportDocumentsQuery(parse(exportDocumentsQuerySchema, req.query)));
      if (result.outcome === 'too_large') {
        res.locals.auditRequest = filtersOf(req, DOCUMENT_FILTERS);
        throw exportTooLarge(result.count, result.limit);
      }
      res.locals.auditRequest = { ...filtersOf(req, DOCUMENT_FILTERS), rows: result.rows };
      sendCsv(res, 'facturacion', result.csv);
    },
  );

  route('get', '/invoicing/documents/:documentId', 'invoicing.read', async (req, res) => {
    const result = await mediator.send(new GetDocumentAdminQuery(req.params.documentId));
    if (result.outcome === 'not_found') throw documentNotFound();
    res.status(200).json(result.document);
  });

  // The PDF and the XML carry the goalkeeper's identity document: a sensitive read (FR-009).
  for (const kind of ['pdf', 'xml'] as const) {
    route(
      'get',
      `/invoicing/documents/:documentId/${kind}`,
      { permission: 'invoicing.read', read: { action: `invoicingDocument.${kind}.read`, resourceType: 'invoicingDocument', resourceId: (req) => String(req.params.documentId) } },
      async (req, res) => {
        const documentId = String(req.params.documentId);
        const result = await mediator.send(new GetDocumentFileQuery(null, documentId, kind));
        switch (result.outcome) {
          case 'success': {
            const detail = await mediator.send(new GetDocumentAdminQuery(documentId));
            const document = detail.outcome === 'ok' ? detail.document : null;
            const name = `${document?.kind === 'credit_note' ? 'nota-credito' : 'factura'}-${document?.number ?? documentId}.${kind}`;
            res
              .status(200)
              .set({ 'Content-Type': result.file.contentType, 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'private, no-store' })
              .send(result.file.content);
            return;
          }
          case 'not_found':
            throw documentNotFound();
          case 'not_issued':
            throw new ApiError(409, 'document_not_issued', 'The document has not been issued yet.', undefined, { status: result.status });
          case 'file_not_available':
            throw new ApiError(404, 'file_not_available', 'The provider has no such file for this document.');
          case 'provider_unavailable':
            throw new ApiError(503, 'provider_unavailable', 'The invoicing provider is not available right now.');
        }
      },
    );
  }

  route(
    'post',
    '/invoicing/documents/:documentId/retry',
    { permission: 'invoicing.retry', audit: { action: 'invoicingDocument.retry', resourceType: 'invoicingDocument', resourceId: (req) => String(req.params.documentId) } },
    async (req, res) => {
      const result = await mediator.send(new RetryDocumentCommand(req.adminAccess!.userId, req.params.documentId));
      switch (result.outcome) {
        case 'retried':
          res.status(202).json(result.document);
          return;
        case 'not_found':
          throw documentNotFound();
        case 'not_retryable':
          throw new ApiError(409, 'document_not_retryable', 'Only a rejected document can be retried.', undefined, { status: result.status });
      }
    },
  );
}
