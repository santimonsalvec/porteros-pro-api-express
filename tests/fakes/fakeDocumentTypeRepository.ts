import type { IDocumentTypeRepository } from '../../src/application/features/porteros/common/ports.js';
import { DocumentType } from '../../src/domain/porteros/documentType.js';

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
