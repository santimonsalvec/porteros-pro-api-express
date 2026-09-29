import type { IQueryHandler } from '../../../../common/mediator/types.js';
import { toDocumentItem } from '../../common/documentResponses.js';
import type { IInvoicingDocumentRepository } from '../../common/ports.js';
import { GetMyDocumentQuery, type GetMyDocumentResult } from './getMyDocumentQuery.js';

export class GetMyDocumentQueryHandler implements IQueryHandler<GetMyDocumentQuery, GetMyDocumentResult> {
  constructor(private readonly documents: IInvoicingDocumentRepository) {}

  async handle(query: GetMyDocumentQuery): Promise<GetMyDocumentResult> {
    const document = await this.documents.getById(query.documentId);
    if (!document || document.goalkeeperId !== query.goalkeeperId) return { outcome: 'not_found' };
    return { outcome: 'success', document: toDocumentItem(document) };
  }
}
