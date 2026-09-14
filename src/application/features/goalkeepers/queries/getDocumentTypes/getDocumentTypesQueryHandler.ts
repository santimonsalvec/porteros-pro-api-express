import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { IDocumentTypeRepository } from '../../common/ports.js';
import { GetDocumentTypesQuery, type GetDocumentTypesResult } from './getDocumentTypesQuery.js';

export class GetDocumentTypesQueryHandler implements IQueryHandler<GetDocumentTypesQuery, GetDocumentTypesResult> {
  constructor(private readonly documentTypeRepository: IDocumentTypeRepository) {}

  async handle(_query: GetDocumentTypesQuery): Promise<GetDocumentTypesResult> {
    const documentTypes = await this.documentTypeRepository.getAll();
    return { documentTypes: documentTypes.map((documentType) => ({ code: documentType.code, name: documentType.name })) };
  }
}
