import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { IAdminDocumentTypeRepository, IReferenceUsage } from '../../common/ports.js';
import { pageOf, toDocumentTypeViews, type DocumentTypeView, type Page } from '../../common/views.js';
import { ListDocumentTypesQuery } from './listDocumentTypesQuery.js';

export class ListDocumentTypesQueryHandler implements IQueryHandler<ListDocumentTypesQuery, Page<DocumentTypeView>> {
  constructor(private readonly deps: { documentTypes: IAdminDocumentTypeRepository; usage: IReferenceUsage }) {}

  async handle(query: ListDocumentTypesQuery): Promise<Page<DocumentTypeView>> {
    const found = await this.deps.documentTypes.list({ ...query.filters, page: query.page, pageSize: query.pageSize });
    return pageOf(await toDocumentTypeViews(found.items, this.deps.usage), query.page, query.pageSize, found.totalItems);
  }
}
