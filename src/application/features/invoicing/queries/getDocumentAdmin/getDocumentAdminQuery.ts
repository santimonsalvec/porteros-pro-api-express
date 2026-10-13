import { IQuery } from '../../../../common/mediator/types.js';
import type { DocumentAdminDetail } from '../../common/documentAdminViews.js';

export type GetDocumentAdminResult = { outcome: 'ok'; document: DocumentAdminDetail } | { outcome: 'not_found' };

/** One document with where it comes from and what it corrects (admin spec 007, FR-008). */
export class GetDocumentAdminQuery extends IQuery<GetDocumentAdminResult> {
  constructor(public readonly documentId: string) {
    super();
  }
}
