import { beforeEach, describe, expect, it } from 'vitest';
import { StoreImageCommand } from '../../../../../src/application/features/images/commands/storeImage/storeImageCommand.js';
import { StoreImageCommandHandler } from '../../../../../src/application/features/images/commands/storeImage/storeImageCommandHandler.js';
import { FakeImageStorageProvider } from '../../../../fakes/fakeImageStorageProvider.js';
import { FakeImageRepository } from '../../../../fakes/fakeImageRepository.js';

describe('StoreImageCommandHandler', () => {
  let imageStorageProvider: FakeImageStorageProvider;
  let imageRepository: FakeImageRepository;
  let idCounter: number;
  let handler: StoreImageCommandHandler;

  beforeEach(() => {
    imageStorageProvider = new FakeImageStorageProvider();
    imageRepository = new FakeImageRepository();
    idCounter = 0;
    handler = new StoreImageCommandHandler(imageStorageProvider, imageRepository, { newId: () => `image-${++idCounter}` });
  });

  it('stores the provider-optimized image and creates a matching record', async () => {
    const result = await handler.handle(new StoreImageCommand('user-1', Buffer.from('fake-bytes'), 'image/jpeg'));

    expect(result.outcome).toBe('success');
    expect(result.image).toMatchObject({
      id: 'image-1',
      url: imageStorageProvider.uploadResult.url,
      format: imageStorageProvider.uploadResult.format,
      bytes: imageStorageProvider.uploadResult.bytes,
      width: imageStorageProvider.uploadResult.width,
      height: imageStorageProvider.uploadResult.height,
    });
    const stored = await imageRepository.getById('image-1');
    expect(stored?.uploadedBy).toBe('user-1');
    expect(stored?.externalId).toBe(imageStorageProvider.uploadResult.externalId);
  });

  it('returns storage_unavailable and creates no record when the provider upload fails', async () => {
    imageStorageProvider.uploadError = new Error('Cloudinary is down');

    const result = await handler.handle(new StoreImageCommand('user-1', Buffer.from('fake-bytes'), 'image/jpeg'));

    expect(result.outcome).toBe('storage_unavailable');
    expect(await imageRepository.getAll()).toHaveLength(0);
  });

  it('compensates by deleting the provider asset when persisting the record fails', async () => {
    imageRepository.addError = new Error('Mongo write failed');

    await expect(handler.handle(new StoreImageCommand('user-1', Buffer.from('fake-bytes'), 'image/jpeg'))).rejects.toThrow(
      'Mongo write failed',
    );

    expect(imageStorageProvider.deletedExternalIds).toEqual([imageStorageProvider.uploadResult.externalId]);
  });
});
