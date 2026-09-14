import type { IDocumentTypeRepository } from '../../src/application/features/goalkeepers/common/ports.js';
import { DocumentType } from '../../src/domain/goalkeepers/documentType.js';

export class FakeDocumentTypeRepository implements IDocumentTypeRepository {
  private readonly documentTypes = new Map<string, DocumentType>();

  seed(documentType: DocumentType): void {
    this.documentTypes.set(documentType.id, documentType);
  }

  async getAll(): Promise<DocumentType[]> {
    return [...this.documentTypes.values()];
  }

  async findByCode(code: string): Promise<DocumentType | null> {
    for (const documentType of this.documentTypes.values()) {
      if (documentType.code === code) return documentType;
    }
    return null;
  }
}
