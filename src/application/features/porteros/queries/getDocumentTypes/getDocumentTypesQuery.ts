import { IQuery } from '../../../../common/mediator/types.js';

export interface DocumentTypeResponse {
  code: string;
  name: string;
}

export interface GetDocumentTypesResult {
  documentTypes: DocumentTypeResponse[];
}

export class GetDocumentTypesQuery extends IQuery<GetDocumentTypesResult> {}
