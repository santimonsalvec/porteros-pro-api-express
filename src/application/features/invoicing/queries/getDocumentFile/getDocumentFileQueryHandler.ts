import type { IQueryHandler } from '../../../../common/mediator/types.js';
import { resolveTarget, type IssueDocumentDependencies } from '../../common/issueDocument.js';
import { GetDocumentFileQuery, type GetDocumentFileResult } from './getDocumentFileQuery.js';

/** Proxies the file from the provider the document was issued with; nothing is stored locally. */
export class GetDocumentFileQueryHandler implements IQueryHandler<GetDocumentFileQuery, GetDocumentFileResult> {
  constructor(private readonly deps: IssueDocumentDependencies) {}

  async handle(query: GetDocumentFileQuery): Promise<GetDocumentFileResult> {
    const document = await this.deps.documents.getById(query.documentId);
    if (!document || document.goalkeeperId !== query.goalkeeperId) return { outcome: 'not_found' };
    if (document.status !== 'issued') return { outcome: 'not_issued', status: document.status };
    const resolved = await resolveTarget(this.deps, document, null);
    if (resolved.kind === 'gap') return { outcome: 'provider_unavailable' };
    try {
      const file = await resolved.target.provider.getFile(document, query.kind, resolved.target.context);
      return file ? { outcome: 'success', file } : { outcome: 'file_not_available' };
    } catch (error) {
      this.deps.logger.warn(
        { outcome: 'invoicing_file_unavailable', documentId: document.id, kind: query.kind, message: error instanceof Error ? error.message : String(error) },
        'Invoicing file could not be read',
      );
      return { outcome: 'provider_unavailable' };
    }
  }
}
