import type { IClock } from '../../../../common/clock.js';
import type { IQueryHandler } from '../../../../common/mediator/types.js';
import { toAdminDocumentItem } from '../../common/documentResponses.js';
import type { IInvoicingDocumentRepository } from '../../common/ports.js';
import { ListDocumentsForAdminQuery, type ListDocumentsForAdminResult } from './listDocumentsForAdminQuery.js';

export class ListDocumentsForAdminQueryHandler implements IQueryHandler<ListDocumentsForAdminQuery, ListDocumentsForAdminResult> {
  constructor(
    private readonly documents: IInvoicingDocumentRepository,
    private readonly clock: IClock,
  ) {}

  async handle(query: ListDocumentsForAdminQuery): Promise<ListDocumentsForAdminResult> {
    const { status, page, pageSize } = query;
    const [documents, totalItems] = await Promise.all([
      this.documents.listByStatus(status, (page - 1) * pageSize, pageSize),
      this.documents.countByStatus(status),
    ]);
    const now = this.clock.now();
    return { items: documents.map((document) => toAdminDocumentItem(document, now)), page, pageSize, totalItems, totalPages: Math.ceil(totalItems / pageSize) };
  }
}
