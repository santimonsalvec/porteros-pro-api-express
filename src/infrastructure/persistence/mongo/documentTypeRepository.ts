import type { Collection, Db, Document } from 'mongodb';
import type { Found, IAdminDocumentTypeRepository, PageRequest, UpdateResult } from '../../../application/features/geography/common/ports.js';
import { idFilter } from './idFilter.js';
import { allOf, deleteById, prefixFilter, updateAtRevision } from './revisionWrite.js';
import type { IDocumentTypeRepository } from '../../../application/features/goalkeepers/common/ports.js';
import { DocumentType } from '../../../domain/goalkeepers/documentType.js';

/**
 * The accepted identification documents: goalkeepers read them (and store the code), the admin
 * web edits them (admin spec 003).
 */
export class DocumentTypeRepository implements IDocumentTypeRepository, IAdminDocumentTypeRepository {
  private readonly collection: Collection<Document>;

  constructor(db: Db) {
    this.collection = db.collection('documentTypes');
  }

  private fromDocument(doc: Document): DocumentType {
    return new DocumentType({
      id: String(doc._id),
      code: doc.code as string,
      name: doc.name as string,
      revision: doc.revision as number | undefined,
    });
  }

  async getAll(): Promise<DocumentType[]> {
    const docs = await this.collection.find({}).toArray();
    return docs.map((doc) => this.fromDocument(doc));
  }

  async findByCode(code: string): Promise<DocumentType | null> {
    const doc = await this.collection.findOne({ code });
    return doc ? this.fromDocument(doc) : null;
  }

  async list(query: PageRequest & { q?: string }): Promise<Found<DocumentType>> {
    const filter = allOf(query.q ? [{ $or: [prefixFilter('name', query.q), prefixFilter('code', query.q)] }] : []);
    const [docs, totalItems] = await Promise.all([
      this.collection.find(filter).sort({ name: 1, _id: 1 }).skip((query.page - 1) * query.pageSize).limit(query.pageSize).toArray(),
      this.collection.countDocuments(filter),
    ]);
    return { items: docs.map((doc) => this.fromDocument(doc)), totalItems };
  }

  async getById(id: string): Promise<DocumentType | null> {
    const doc = await this.collection.findOne(idFilter(id));
    return doc ? this.fromDocument(doc) : null;
  }

  async create(documentType: DocumentType): Promise<void> {
    await this.collection.insertOne({ _id: documentType.id, code: documentType.code, name: documentType.name, revision: 0 } as Document);
  }

  update(documentType: DocumentType): Promise<UpdateResult> {
    return updateAtRevision(this.collection, documentType.id, documentType.revision, { code: documentType.code, name: documentType.name });
  }

  delete(id: string): Promise<boolean> {
    return deleteById(this.collection, id);
  }
}
