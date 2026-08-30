import type { Db, Document } from 'mongodb';
import type { IImageRepository } from '../../../application/features/images/common/ports.js';
import { StoredImage } from '../../../domain/images/storedImage.js';
import { MongoRepository } from './mongoRepository.js';

export class ImageRepository extends MongoRepository<StoredImage, string> implements IImageRepository {
  constructor(db: Db) {
    super(db.collection('images'));
  }

  protected toDocument(entity: StoredImage): Document {
    return {
      _id: entity.id,
      externalId: entity.externalId,
      url: entity.url,
      format: entity.format,
      bytes: entity.bytes,
      width: entity.width,
      height: entity.height,
      uploadedBy: entity.uploadedBy,
      createdAt: entity.createdAt,
    };
  }

  protected fromDocument(doc: Document): StoredImage {
    return new StoredImage({
      id: doc._id as string,
      externalId: doc.externalId as string,
      url: doc.url as string,
      format: doc.format as string,
      bytes: doc.bytes as number,
      width: doc.width as number,
      height: doc.height as number,
      uploadedBy: doc.uploadedBy as string,
      createdAt: new Date(doc.createdAt as string | Date),
    });
  }
}
