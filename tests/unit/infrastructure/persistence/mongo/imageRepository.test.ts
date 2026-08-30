import { describe, expect, it } from 'vitest';
import type { Collection, Db, Document } from 'mongodb';
import { ImageRepository } from '../../../../../src/infrastructure/persistence/mongo/imageRepository.js';
import { StoredImage } from '../../../../../src/domain/images/storedImage.js';
import { createFakeCollection } from '../../../../fakes/fakeMongoCollection.js';

function repositoryWith(collection: ReturnType<typeof createFakeCollection>) {
  const db = { collection: () => collection as unknown as Collection<Document> } as unknown as Db;
  return new ImageRepository(db);
}

describe('ImageRepository (mocked driver)', () => {
  it('maps a StoredImage to its document shape on add', async () => {
    const collection = createFakeCollection();
    collection.insertOne.mockResolvedValue({ acknowledged: true, insertedId: 'image-1' });
    const repository = repositoryWith(collection);
    const createdAt = new Date('2026-08-30T15:04:05.000Z');

    await repository.add(
      new StoredImage({
        id: 'image-1',
        externalId: 'cloudinary-public-id',
        url: 'https://res.cloudinary.com/demo/image/upload/v1/abc.jpg',
        format: 'jpg',
        bytes: 184320,
        width: 3024,
        height: 4032,
        uploadedBy: 'user-1',
        createdAt,
      }),
    );

    const doc = collection.insertOne.mock.calls[0]![0] as Record<string, unknown>;
    expect(doc).toMatchObject({
      _id: 'image-1',
      externalId: 'cloudinary-public-id',
      url: 'https://res.cloudinary.com/demo/image/upload/v1/abc.jpg',
      format: 'jpg',
      bytes: 184320,
      width: 3024,
      height: 4032,
      uploadedBy: 'user-1',
      createdAt,
    });
  });

  it('round-trips a document back into a StoredImage on getById', async () => {
    const collection = createFakeCollection();
    collection.findOne.mockResolvedValue({
      _id: 'image-2',
      externalId: 'cloudinary-public-id-2',
      url: 'https://res.cloudinary.com/demo/image/upload/v1/def.jpg',
      format: 'webp',
      bytes: 55000,
      width: 800,
      height: 600,
      uploadedBy: 'user-2',
      createdAt: '2026-08-30T15:04:05.000Z',
    });
    const repository = repositoryWith(collection);

    const found = await repository.getById('image-2');

    expect(found?.id).toBe('image-2');
    expect(found?.externalId).toBe('cloudinary-public-id-2');
    expect(found?.format).toBe('webp');
    expect(found?.bytes).toBe(55000);
    expect(found?.uploadedBy).toBe('user-2');
    expect(found?.createdAt).toEqual(new Date('2026-08-30T15:04:05.000Z'));
  });
});
