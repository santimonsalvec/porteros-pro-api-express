import type { Request, Response } from 'express';
import type { ISender } from '../../application/common/mediator/types.js';
import { GetDocumentFileQuery } from '../../application/features/invoicing/queries/getDocumentFile/getDocumentFileQuery.js';
import { GetMyDocumentQuery } from '../../application/features/invoicing/queries/getMyDocument/getMyDocumentQuery.js';
import { ListMyDocumentsQuery } from '../../application/features/invoicing/queries/listMyDocuments/listMyDocumentsQuery.js';
import { ApiError } from '../apiError.js';
import { zodFieldErrors } from '../requests/goalkeeperRequests/getServiceQuoteRequest.js';
import { listClientBookingsRequestSchema } from '../requests/goalkeeperRequests/listClientBookingsRequest.js';
import { goalkeeperNotFound } from '../wallet/walletHttp.js';

/** The goalkeeper's invoices and credit notes (feature 023, contracts/invoicing.md §1). */

export function documentNotFound(): ApiError {
  return new ApiError(404, 'invoicing_document_not_found', 'No invoicing document with this id exists for this goalkeeper.');
}

export async function sendMyDocuments(mediator: ISender, goalkeeperId: string, req: Request, res: Response): Promise<void> {
  const parsed = listClientBookingsRequestSchema.safeParse(req.query);
  if (!parsed.success) {
    throw new ApiError(400, 'validation_failed', 'One or more fields are missing or invalid.', zodFieldErrors(parsed.error));
  }
  const result = await mediator.send(new ListMyDocumentsQuery(goalkeeperId, parsed.data.page, parsed.data.pageSize));
  switch (result.outcome) {
    case 'success':
      res.status(200).json({ items: result.items, page: result.page, pageSize: result.pageSize, totalItems: result.totalItems, totalPages: result.totalPages });
      return;
    case 'not_a_goalkeeper':
      throw goalkeeperNotFound();
  }
}

export async function sendMyDocument(mediator: ISender, goalkeeperId: string, documentId: string, res: Response): Promise<void> {
  const result = await mediator.send(new GetMyDocumentQuery(goalkeeperId, documentId));
  switch (result.outcome) {
    case 'success':
      res.status(200).json(result.document);
      return;
    case 'not_found':
      throw documentNotFound();
  }
}

export async function sendDocumentFile(mediator: ISender, goalkeeperId: string, documentId: string, kind: 'pdf' | 'xml', res: Response): Promise<void> {
  const result = await mediator.send(new GetDocumentFileQuery(goalkeeperId, documentId, kind));
  switch (result.outcome) {
    case 'success':
      res
        .status(200)
        .set({ 'Content-Type': result.file.contentType, 'Content-Disposition': `attachment; filename="${result.file.fileName}"`, 'Cache-Control': 'private, no-store' })
        .send(result.file.content);
      return;
    case 'not_found':
      throw documentNotFound();
    case 'not_issued':
      throw new ApiError(409, 'document_not_issued', 'The document has not been issued yet.', undefined, { status: result.status });
    case 'file_not_available':
      throw new ApiError(404, 'file_not_available', 'The provider has no such file for this document.');
    case 'provider_unavailable':
      throw new ApiError(503, 'provider_unavailable', 'The invoicing provider is not available right now.');
  }
}
