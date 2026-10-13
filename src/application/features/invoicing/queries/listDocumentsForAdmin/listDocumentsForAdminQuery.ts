import { IQuery } from '../../../../common/mediator/types.js';
import type { InvoicingDocumentStatus } from '../../../../../domain/invoicing/invoicingDocument.js';
import type { DocumentAdminFilter } from '../../common/adminPorts.js';
import type { DocumentAdminRow } from '../../common/documentAdminViews.js';

export interface ListDocumentsForAdminResult {
  items: DocumentAdminRow[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  /** Whether documents are being sent at all (`INVOICING_ENABLED`, admin spec 007). */
  issuingEnabled: boolean;
}

/** Documents by status, oldest first, with reasons and staleness (contracts §2); admin spec 007 adds `filters`. */
export class ListDocumentsForAdminQuery extends IQuery<ListDocumentsForAdminResult> {
  constructor(
    public readonly status: InvoicingDocumentStatus | null,
    public readonly page: number,
    public readonly pageSize: number,
    public readonly filters: Omit<DocumentAdminFilter, 'status'> = {},
  ) {
    super();
  }
}
