import type { ICommandHandler } from '../../../../common/mediator/types.js';
import { DeleteImageCommand } from '../../../images/commands/deleteImage/deleteImageCommand.js';
import type { BackgroundCheckDependencies } from '../../common/backgroundCheckDependencies.js';
import { DeleteBackgroundCheckCommand, type DeleteBackgroundCheckResult } from './deleteBackgroundCheckCommand.js';

/** Only a pending check of the caller; its image goes once the check is gone. */
export class DeleteBackgroundCheckCommandHandler implements ICommandHandler<DeleteBackgroundCheckCommand, DeleteBackgroundCheckResult> {
  constructor(private readonly deps: Pick<BackgroundCheckDependencies, 'checks' | 'sender'>) {}

  async handle(command: DeleteBackgroundCheckCommand): Promise<DeleteBackgroundCheckResult> {
    const check = await this.deps.checks.findForGoalkeeper(command.checkId, command.userId);
    if (!check) return { outcome: 'not_found' };
    const outcome = await this.deps.checks.deletePending(check.id, command.userId);
    if (outcome === 'deleted') await this.deps.sender.send(new DeleteImageCommand(command.userId, check.imageId));
    return { outcome };
  }
}
