import type { ICommandHandler, ISender } from '../../../../common/mediator/types.js';
import type { IGoalkeeperRegistrationRepository } from '../../common/ports.js';
import { toGoalkeeperRegistrationResponse } from '../../common/goalkeeperRegistrationResponse.js';
import { DeleteImageCommand } from '../../../images/commands/deleteImage/deleteImageCommand.js';
import { CancelGoalkeeperRegistrationCommand, type CancelGoalkeeperRegistrationResult } from './cancelGoalkeeperRegistrationCommand.js';

/** A missing registration is treated the same as one with no data — a graceful success no-op (spec Edge Cases). */
export class CancelGoalkeeperRegistrationCommandHandler
  implements ICommandHandler<CancelGoalkeeperRegistrationCommand, CancelGoalkeeperRegistrationResult>
{
  constructor(
    private readonly sender: ISender,
    private readonly goalkeeperRegistrationRepository: IGoalkeeperRegistrationRepository,
  ) {}

  async handle(command: CancelGoalkeeperRegistrationCommand): Promise<CancelGoalkeeperRegistrationResult> {
    const registration = await this.goalkeeperRegistrationRepository.getByUserId(command.userId);

    if (!registration) {
      return { outcome: 'success', registration: toGoalkeeperRegistrationResponse(null) };
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

    await this.goalkeeperRegistrationRepository.delete(registration.id);

    return { outcome: 'success', registration: toGoalkeeperRegistrationResponse(null) };
  }
}
