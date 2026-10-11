import { IQuery } from '../../../../common/mediator/types.js';
import type { DocumentTypeView } from '../../common/views.js';

export type GetDocumentTypeResult = { outcome: 'ok'; documentType: DocumentTypeView } | { outcome: 'not_found' };

export class GetDocumentTypeQuery extends IQuery<GetDocumentTypeResult> {
  constructor(readonly documentTypeId: string) {
    super();
  }
}
