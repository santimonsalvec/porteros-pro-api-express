import type { ICommandHandler, ISender } from '../../../../common/mediator/types.js';
import type { IIdGenerator } from '../../../auth/common/ports.js';
import type { IPorteroRegistrationRepository } from '../../common/ports.js';
import { toPorteroRegistrationResponse } from '../../common/porteroRegistrationResponse.js';
import { PorteroRegistration } from '../../../../../domain/porteros/porteroRegistration.js';
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
    private readonly porteroRegistrationRepository: IPorteroRegistrationRepository,
    private readonly idGenerator: IIdGenerator,
  ) {}

  async handle(command: SaveDocumentPhotoCommand): Promise<SaveDocumentPhotoResult> {
    let registration = await this.porteroRegistrationRepository.getByUserId(command.userId);
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
      registration = PorteroRegistration.createEmpty(this.idGenerator.newId(), command.userId);
    }
    registration.setDocumentPhoto(command.side, uploadResult.image.id);

    if (isNew) {
      await this.porteroRegistrationRepository.add(registration);
    } else {
      await this.porteroRegistrationRepository.update(registration);
    }

    if (previousImageId) {
      await this.sender.send(new DeleteImageCommand(command.userId, previousImageId));
    }

    return { outcome: 'success', registration: toPorteroRegistrationResponse(registration) };
  }
}
