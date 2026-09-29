import { IQuery } from '../../../../common/mediator/types.js';
import type { InvoicingDocumentStatus } from '../../../../../domain/invoicing/invoicingDocument.js';
import type { AdminDocumentItemResponse } from '../../common/documentResponses.js';

export interface ListDocumentsForAdminResult {
  items: AdminDocumentItemResponse[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

/** Documents by status, oldest first, with reasons and staleness (contracts §2). */
export class ListDocumentsForAdminQuery extends IQuery<ListDocumentsForAdminResult> {
  constructor(
    public readonly status: InvoicingDocumentStatus | null,
    public readonly page: number,
    public readonly pageSize: number,
  ) {
    super();
  }
}
