import { beforeEach, describe, expect, it } from 'vitest';
import { DeleteImageCommand } from '../../../../../src/application/features/images/commands/deleteImage/deleteImageCommand.js';
import { DeleteImageCommandHandler } from '../../../../../src/application/features/images/commands/deleteImage/deleteImageCommandHandler.js';
import { FakeImageStorageProvider } from '../../../../fakes/fakeImageStorageProvider.js';
import { FakeImageRepository } from '../../../../fakes/fakeImageRepository.js';
import { StoredImage } from '../../../../../src/domain/images/storedImage.js';

describe('DeleteImageCommandHandler', () => {
  let imageStorageProvider: FakeImageStorageProvider;
  let imageRepository: FakeImageRepository;
  let handler: DeleteImageCommandHandler;

  beforeEach(async () => {
    imageStorageProvider = new FakeImageStorageProvider();
    imageRepository = new FakeImageRepository();
    handler = new DeleteImageCommandHandler(imageStorageProvider, imageRepository);
    await imageRepository.add(
      StoredImage.create({
        id: 'image-1',
        externalId: 'ext-1',
        url: 'https://res.cloudinary.com/demo/image/upload/v1/abc.jpg',
        format: 'jpg',
        bytes: 1000,
        width: 100,
        height: 100,
        uploadedBy: 'user-1',
      }),
    );
  });

  it('removes the provider asset and the record for the uploader', async () => {
    const result = await handler.handle(new DeleteImageCommand('user-1', 'image-1'));

    expect(result.outcome).toBe('success');
    expect(imageStorageProvider.deletedExternalIds).toEqual(['ext-1']);
    expect(await imageRepository.getById('image-1')).toBeNull();
  });

  it('returns not_found for an unknown or already-deleted id', async () => {
    const result = await handler.handle(new DeleteImageCommand('user-1', 'does-not-exist'));

    expect(result.outcome).toBe('not_found');
  });

  it('returns forbidden for a different user and keeps the record', async () => {
    const result = await handler.handle(new DeleteImageCommand('user-2', 'image-1'));

    expect(result.outcome).toBe('forbidden');
    expect(await imageRepository.getById('image-1')).not.toBeNull();
  });

  it('leaves the record in place when the provider delete fails', async () => {
    imageStorageProvider.deleteError = new Error('Cloudinary is down');

    await expect(handler.handle(new DeleteImageCommand('user-1', 'image-1'))).rejects.toThrow('Cloudinary is down');

    expect(await imageRepository.getById('image-1')).not.toBeNull();
  });
});
