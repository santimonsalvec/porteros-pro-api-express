import type { Collection, Db, Document } from 'mongodb';
import type { IDocumentTypeRepository } from '../../../application/features/porteros/common/ports.js';
import { DocumentType } from '../../../domain/porteros/documentType.js';

/**
 * Manually seeded, read-only reference data (research.md §7) — mirrors
 * `CountryRepository`'s pattern, minus the write-methods-that-throw since no port
 * here requires them.
 */
export class DocumentTypeRepository implements IDocumentTypeRepository {
  private readonly collection: Collection<Document>;

  constructor(db: Db) {
    this.collection = db.collection('documentTypes');
  }

  private fromDocument(doc: Document): DocumentType {
    return new DocumentType({ id: String(doc._id), code: doc.code as string, name: doc.name as string });
  }

  async getAll(): Promise<DocumentType[]> {
    const docs = await this.collection.find({}).toArray();
    return docs.map((doc) => this.fromDocument(doc));
  }

  async findByCode(code: string): Promise<DocumentType | null> {
    const doc = await this.collection.findOne({ code });
    return doc ? this.fromDocument(doc) : null;
  }
}
