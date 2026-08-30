import type { Collection, Document } from 'mongodb';
import { Entity } from '../../src/domain/common/entity.js';
import { MongoRepository } from '../../src/infrastructure/persistence/mongo/mongoRepository.js';

/** A throwaway entity/collection used only to exercise MongoRepository generically. */
export class TestFixtureEntity extends Entity<string> {
  constructor(
    id: string,
    public label: string,
  ) {
    super(id);
  }
}

export class TestFixtureRepository extends MongoRepository<TestFixtureEntity, string> {
  constructor(collection: Collection<Document>) {
    super(collection);
  }

  protected toDocument(entity: TestFixtureEntity): Document {
    return { _id: entity.id, label: entity.label };
  }

  protected fromDocument(doc: Document): TestFixtureEntity {
    return new TestFixtureEntity(doc._id as string, doc.label as string);
  }
}
