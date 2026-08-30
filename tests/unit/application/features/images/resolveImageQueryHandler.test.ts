import { beforeEach, describe, expect, it } from 'vitest';
import { ResolveImageQuery } from '../../../../../src/application/features/images/queries/resolveImage/resolveImageQuery.js';
import { ResolveImageQueryHandler } from '../../../../../src/application/features/images/queries/resolveImage/resolveImageQueryHandler.js';
import { FakeImageRepository } from '../../../../fakes/fakeImageRepository.js';
import { StoredImage } from '../../../../../src/domain/images/storedImage.js';

describe('ResolveImageQueryHandler', () => {
  let imageRepository: FakeImageRepository;
  let handler: ResolveImageQueryHandler;

  beforeEach(async () => {
    imageRepository = new FakeImageRepository();
    handler = new ResolveImageQueryHandler(imageRepository);
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

  it('returns the image for its uploader', async () => {
    const result = await handler.handle(new ResolveImageQuery('user-1', 'image-1'));

    expect(result.outcome).toBe('success');
    expect(result.image?.id).toBe('image-1');
  });

  it('returns not_found for an unknown id', async () => {
    const result = await handler.handle(new ResolveImageQuery('user-1', 'does-not-exist'));

    expect(result.outcome).toBe('not_found');
  });

  it('returns forbidden for a different user', async () => {
    const result = await handler.handle(new ResolveImageQuery('user-2', 'image-1'));

    expect(result.outcome).toBe('forbidden');
  });
});
