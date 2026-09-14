import type { ICommandHandler, ISender } from '../../../../common/mediator/types.js';
import type { IIdGenerator } from '../../../auth/common/ports.js';
import type { IGoalkeeperRegistrationRepository } from '../../common/ports.js';
import { toGoalkeeperRegistrationResponse } from '../../common/goalkeeperRegistrationResponse.js';
import { GoalkeeperRegistration } from '../../../../../domain/goalkeepers/goalkeeperRegistration.js';
import { StoreImageCommand } from '../../../images/commands/storeImage/storeImageCommand.js';
import { DeleteImageCommand } from '../../../images/commands/deleteImage/deleteImageCommand.js';
import { SaveDocumentPhotoCommand, type SaveDocumentPhotoResult } from './saveDocumentPhotoCommand.js';

/**
 * Depends only on the mediator (`ISender`) and this feature's own registration
 * repository — never on the image feature's ports directly (research.md §5). The
 * new upload succeeds at the storage provider *before* any previous photo for that
 * side is deleted, so a failed re-upload never leaves the client with zero photos.
 */
export class SaveDocumentPhotoCommandHandler implements ICommandHandler<SaveDocumentPhotoCommand, SaveDocumentPhotoResult> {
  constructor(
    private readonly sender: ISender,
    private readonly goalkeeperRegistrationRepository: IGoalkeeperRegistrationRepository,
    private readonly idGenerator: IIdGenerator,
  ) {}

  async handle(command: SaveDocumentPhotoCommand): Promise<SaveDocumentPhotoResult> {
    let registration = await this.goalkeeperRegistrationRepository.getByUserId(command.userId);
    if (registration?.status === 'active') {
      return { outcome: 'already_active' };
    }

    const uploadResult = await this.sender.send(
      new StoreImageCommand(command.userId, command.buffer, command.contentType),
    );
    if (uploadResult.outcome === 'storage_unavailable' || !uploadResult.image) {
      return { outcome: 'storage_unavailable' };
    }

    const previousImageId =
      command.side === 'A' ? registration?.identification.documentPhotoAId : registration?.identification.documentPhotoBId;

    const isNew = registration === null;
    if (!registration) {
      registration = GoalkeeperRegistration.createEmpty(this.idGenerator.newId(), command.userId);
    }
    registration.setDocumentPhoto(command.side, uploadResult.image.id);

    if (isNew) {
      await this.goalkeeperRegistrationRepository.add(registration);
    } else {
      await this.goalkeeperRegistrationRepository.update(registration);
    }

    if (previousImageId) {
      await this.sender.send(new DeleteImageCommand(command.userId, previousImageId));
    }

    return { outcome: 'success', registration: toGoalkeeperRegistrationResponse(registration) };
  }
}
