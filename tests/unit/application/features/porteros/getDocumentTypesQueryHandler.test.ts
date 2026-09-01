import { describe, expect, it } from 'vitest';
import { GetDocumentTypesQuery } from '../../../../../src/application/features/porteros/queries/getDocumentTypes/getDocumentTypesQuery.js';
import { GetDocumentTypesQueryHandler } from '../../../../../src/application/features/porteros/queries/getDocumentTypes/getDocumentTypesQueryHandler.js';
import { FakeDocumentTypeRepository } from '../../../../fakes/fakeDocumentTypeRepository.js';
import { DocumentType } from '../../../../../src/domain/porteros/documentType.js';

describe('GetDocumentTypesQueryHandler', () => {
  it('returns every seeded document type', async () => {
    const repository = new FakeDocumentTypeRepository();
    repository.seed(new DocumentType({ id: 'dt1', code: 'cedula_ciudadania', name: 'Cédula de ciudadanía' }));
    repository.seed(new DocumentType({ id: 'dt2', code: 'pasaporte', name: 'Pasaporte' }));
    const handler = new GetDocumentTypesQueryHandler(repository);

    const result = await handler.handle(new GetDocumentTypesQuery());

    expect(result.documentTypes).toHaveLength(2);
    expect(result.documentTypes).toContainEqual({ code: 'cedula_ciudadania', name: 'Cédula de ciudadanía' });
  });
});
