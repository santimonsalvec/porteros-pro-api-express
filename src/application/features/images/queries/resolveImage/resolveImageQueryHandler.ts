import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { IImageRepository } from '../../common/ports.js';
import { toStoredImageResponse } from '../../common/storedImageResponse.js';
import { ResolveImageQuery, type ResolveImageResult } from './resolveImageQuery.js';

export class ResolveImageQueryHandler implements IQueryHandler<ResolveImageQuery, ResolveImageResult> {
  constructor(private readonly imageRepository: IImageRepository) {}

  async handle(query: ResolveImageQuery): Promise<ResolveImageResult> {
    const image = await this.imageRepository.getById(query.imageId);
    if (!image) {
      return { outcome: 'not_found' };
    }
    if (image.uploadedBy !== query.userId) {
      return { outcome: 'forbidden' };
    }
    return { outcome: 'success', image: toStoredImageResponse(image) };
  }
}
