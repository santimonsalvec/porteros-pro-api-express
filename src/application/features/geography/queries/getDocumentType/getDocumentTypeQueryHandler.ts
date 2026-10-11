import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { IAdminDocumentTypeRepository, IReferenceUsage } from '../../common/ports.js';
import { toDocumentTypeViews } from '../../common/views.js';
import { GetDocumentTypeQuery, type GetDocumentTypeResult } from './getDocumentTypeQuery.js';

export class GetDocumentTypeQueryHandler implements IQueryHandler<GetDocumentTypeQuery, GetDocumentTypeResult> {
  constructor(private readonly deps: { documentTypes: IAdminDocumentTypeRepository; usage: IReferenceUsage }) {}

  async handle(query: GetDocumentTypeQuery): Promise<GetDocumentTypeResult> {
    const found = await this.deps.documentTypes.getById(query.documentTypeId);
    if (!found) return { outcome: 'not_found' };
    const [view] = await toDocumentTypeViews([found], this.deps.usage);
    return { outcome: 'ok', documentType: view! };
  }
}
