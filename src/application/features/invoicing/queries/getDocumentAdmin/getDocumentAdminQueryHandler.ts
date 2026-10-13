import type { IQueryHandler } from '../../../../common/mediator/types.js';
import { documentRows, relatedOf, type DocumentAdminDependencies } from '../../common/documentAdminViews.js';
import { GetDocumentAdminQuery, type GetDocumentAdminResult } from './getDocumentAdminQuery.js';

export class GetDocumentAdminQueryHandler implements IQueryHandler<GetDocumentAdminQuery, GetDocumentAdminResult> {
  constructor(private readonly deps: Pick<DocumentAdminDependencies, 'reader' | 'documents' | 'users' | 'clock'>) {}

  async handle({ documentId }: GetDocumentAdminQuery): Promise<GetDocumentAdminResult> {
    const document = await this.deps.documents.getById(documentId);
    if (!document) return { outcome: 'not_found' };
    const [[row], original, creditNotes] = await Promise.all([
      documentRows(this.deps, [document], this.deps.clock.now()),
      document.originalDocumentId ? this.deps.documents.getById(document.originalDocumentId) : null,
      document.kind === 'invoice' ? this.deps.reader.creditNotesOf(document.id) : [],
    ]);
    return {
      outcome: 'ok',
      document: {
        ...row!,
        nextAttemptAt: document.nextAttemptAt?.toISOString() ?? null,
        waitingFor: document.waitingFor,
        requestId: document.requestId,
        original: original ? relatedOf(original) : null,
        creditNotes: creditNotes.map(relatedOf),
      },
    };
  }
}
