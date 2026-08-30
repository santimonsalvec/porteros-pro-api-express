import type { Collection, Document, OptionalUnlessRequiredId } from 'mongodb';
import type { Entity } from '../../../domain/common/entity.js';
import type { IRepository } from '../../../application/common/persistence/repository.js';

/**
 * Generic MongoDB-backed implementation of IRepository. Concrete subclasses supply
 * the collection plus the two mapping functions between a domain entity and its BSON
 * document — the base class never needs to know how a concrete entity is shaped.
 * Any driver failure propagates to the caller as-is; no retry logic (FR-005).
 */
export abstract class MongoRepository<TEntity extends Entity<TId>, TId> implements IRepository<TEntity, TId> {
  protected constructor(protected readonly collection: Collection<Document>) {}

  protected abstract toDocument(entity: TEntity): Document;
  protected abstract fromDocument(doc: Document): TEntity;

  async getAll(): Promise<TEntity[]> {
    const docs = await this.collection.find({}).toArray();
    return docs.map((doc) => this.fromDocument(doc));
  }

  async getById(id: TId): Promise<TEntity | null> {
    const doc = await this.collection.findOne({ _id: id } as Document);
    return doc ? this.fromDocument(doc) : null;
  }

  async add(entity: TEntity): Promise<void> {
    await this.collection.insertOne(this.toDocument(entity) as OptionalUnlessRequiredId<Document>);
  }

  async update(entity: TEntity): Promise<void> {
    await this.collection.replaceOne({ _id: entity.id } as Document, this.toDocument(entity));
  }

  async delete(id: TId): Promise<void> {
    await this.collection.deleteOne({ _id: id } as Document);
  }
}
