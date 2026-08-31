import type { ICommandHandler, ISender } from '../../../../common/mediator/types.js';
import type { IPorteroRegistrationRepository } from '../../common/ports.js';
import { toPorteroRegistrationResponse } from '../../common/porteroRegistrationResponse.js';
import { DeleteImageCommand } from '../../../images/commands/deleteImage/deleteImageCommand.js';
import { CancelPorteroRegistrationCommand, type CancelPorteroRegistrationResult } from './cancelPorteroRegistrationCommand.js';

/** A missing registration is treated the same as one with no data — a graceful success no-op (spec Edge Cases). */
export class CancelPorteroRegistrationCommandHandler
  implements ICommandHandler<CancelPorteroRegistrationCommand, CancelPorteroRegistrationResult>
{
  constructor(
    private readonly sender: ISender,
    private readonly porteroRegistrationRepository: IPorteroRegistrationRepository,
  ) {}

  async handle(command: CancelPorteroRegistrationCommand): Promise<CancelPorteroRegistrationResult> {
    const registration = await this.porteroRegistrationRepository.getByUserId(command.userId);

    if (!registration) {
      return { outcome: 'success', registration: toPorteroRegistrationResponse(null) };
    }

    if (registration.status === 'active') {
      return { outcome: 'already_active' };
    }

    const { documentPhotoAId, documentPhotoBId } = registration.identification;
    if (documentPhotoAId) {
      await this.sender.send(new DeleteImageCommand(command.userId, documentPhotoAId));
    }
    if (documentPhotoBId) {
      await this.sender.send(new DeleteImageCommand(command.userId, documentPhotoBId));
    }

    await this.porteroRegistrationRepository.delete(registration.id);

    return { outcome: 'success', registration: toPorteroRegistrationResponse(null) };
  }
}
