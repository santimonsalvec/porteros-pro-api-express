import type { ICommandHandler } from '../../../../common/mediator/types.js';
import type { IImageRepository, IImageStorageProvider } from '../../common/ports.js';
import { DeleteImageCommand, type DeleteImageResult } from './deleteImageCommand.js';

export class DeleteImageCommandHandler implements ICommandHandler<DeleteImageCommand, DeleteImageResult> {
  constructor(
    private readonly imageStorageProvider: IImageStorageProvider,
    private readonly imageRepository: IImageRepository,
  ) {}

  async handle(command: DeleteImageCommand): Promise<DeleteImageResult> {
    const image = await this.imageRepository.getById(command.imageId);
    if (!image) {
      return { outcome: 'not_found' };
    }
    if (image.uploadedBy !== command.userId) {
      return { outcome: 'forbidden' };
    }

    // Provider delete first — if it throws, the record is left in place rather than
    // orphaning the deletion (contracts/delete-image.md).
    await this.imageStorageProvider.delete(image.externalId);
    await this.imageRepository.delete(image.id);

    return { outcome: 'success' };
  }
}
