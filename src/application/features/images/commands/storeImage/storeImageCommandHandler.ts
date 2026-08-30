import type { ICommandHandler } from '../../../../common/mediator/types.js';
import type { IIdGenerator } from '../../../auth/common/ports.js';
import type { IImageRepository, IImageStorageProvider } from '../../common/ports.js';
import { StoredImage } from '../../../../../domain/images/storedImage.js';
import { toStoredImageResponse } from '../../common/storedImageResponse.js';
import { StoreImageCommand, type StoreImageResult } from './storeImageCommand.js';

export class StoreImageCommandHandler implements ICommandHandler<StoreImageCommand, StoreImageResult> {
  constructor(
    private readonly imageStorageProvider: IImageStorageProvider,
    private readonly imageRepository: IImageRepository,
    private readonly idGenerator: IIdGenerator,
  ) {}

  async handle(command: StoreImageCommand): Promise<StoreImageResult> {
    let uploadResult;
    try {
      uploadResult = await this.imageStorageProvider.upload(command.buffer, command.contentType);
    } catch {
      return { outcome: 'storage_unavailable' };
    }

    const image = StoredImage.create({
      id: this.idGenerator.newId(),
      externalId: uploadResult.externalId,
      url: uploadResult.url,
      format: uploadResult.format,
      bytes: uploadResult.bytes,
      width: uploadResult.width,
      height: uploadResult.height,
      uploadedBy: command.userId,
    });

    try {
      await this.imageRepository.add(image);
    } catch (error) {
      // Compensating action (research.md §5): don't leave an orphaned provider asset
      // with no matching record. Best-effort — the original error still wins.
      await this.imageStorageProvider.delete(uploadResult.externalId).catch(() => undefined);
      throw error;
    }

    return { outcome: 'success', image: toStoredImageResponse(image) };
  }
}
