import { IQuery } from '../../../../common/mediator/types.js';
import type { DocumentItemResponse } from '../../common/documentResponses.js';

export type GetMyDocumentResult = { outcome: 'success'; document: DocumentItemResponse } | { outcome: 'not_found' };

/** One of the goalkeeper's own documents; another goalkeeper's is indistinguishable from none. */
export class GetMyDocumentQuery extends IQuery<GetMyDocumentResult> {
  constructor(
    public readonly goalkeeperId: string,
    public readonly documentId: string,
  ) {
    super();
  }
}
