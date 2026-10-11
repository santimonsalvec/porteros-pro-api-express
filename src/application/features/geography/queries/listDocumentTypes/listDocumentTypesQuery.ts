import { IQuery } from '../../../../common/mediator/types.js';
import type { DocumentTypeView, Page } from '../../common/views.js';

/** One page of the catalog (admin spec 003, US5). */
export class ListDocumentTypesQuery extends IQuery<Page<DocumentTypeView>> {
  constructor(
    readonly filters: { q?: string },
    readonly page: number,
    readonly pageSize: number,
  ) {
    super();
  }
}
