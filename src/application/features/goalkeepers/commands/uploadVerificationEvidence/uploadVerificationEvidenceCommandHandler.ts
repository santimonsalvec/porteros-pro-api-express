import type { ICommandHandler, ISender } from '../../../../common/mediator/types.js';
import { StoreImageCommand } from '../../../images/commands/storeImage/storeImageCommand.js';
import type { IGoalkeeperProfileRepository } from '../../common/ports.js';
import { UploadVerificationEvidenceCommand, type UploadVerificationEvidenceResult } from './uploadVerificationEvidenceCommand.js';

/** The image is stored in the staff member's name; the verification then names it (research §8). */
export class UploadVerificationEvidenceCommandHandler implements ICommandHandler<UploadVerificationEvidenceCommand, UploadVerificationEvidenceResult> {
  constructor(private readonly deps: { profiles: Pick<IGoalkeeperProfileRepository, 'getByUserId'>; sender: ISender }) {}

  async handle(command: UploadVerificationEvidenceCommand): Promise<UploadVerificationEvidenceResult> {
    if (!(await this.deps.profiles.getByUserId(command.goalkeeperId))) return { outcome: 'not_a_goalkeeper' };
    const stored = await this.deps.sender.send(new StoreImageCommand(command.staffUserId, command.buffer, command.contentType));
    if (stored.outcome !== 'success' || !stored.image) return { outcome: 'storage_unavailable' };
    return { outcome: 'created', imageId: stored.image.id, url: stored.image.url };
  }
}
