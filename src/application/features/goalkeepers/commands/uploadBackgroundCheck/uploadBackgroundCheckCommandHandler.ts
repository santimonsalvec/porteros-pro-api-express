import type { ICommandHandler } from '../../../../common/mediator/types.js';
import { BACKGROUND_CHECK_LIMIT, BackgroundCheck } from '../../../../../domain/goalkeepers/backgroundCheck.js';
import { StoreImageCommand } from '../../../images/commands/storeImage/storeImageCommand.js';
import type { BackgroundCheckDependencies } from '../../common/backgroundCheckDependencies.js';
import { toMyBackgroundCheck } from '../../common/vettingViews.js';
import { UploadBackgroundCheckCommand, type UploadBackgroundCheckResult } from './uploadBackgroundCheckCommand.js';

/** The limit is checked before storing, so a refused upload never leaves an orphan image. */
export class UploadBackgroundCheckCommandHandler implements ICommandHandler<UploadBackgroundCheckCommand, UploadBackgroundCheckResult> {
  constructor(private readonly deps: BackgroundCheckDependencies) {}

  async handle(command: UploadBackgroundCheckCommand): Promise<UploadBackgroundCheckResult> {
    const now = this.deps.clock.now();
    const profile = await this.deps.profiles.getByUserId(command.userId);
    if (!profile) return { outcome: 'not_a_goalkeeper' };

    const existing = await this.deps.checks.listForGoalkeeper(command.userId);
    if (existing.filter((check) => check.isActiveAt(now)).length >= BACKGROUND_CHECK_LIMIT) return { outcome: 'limit_reached' };

    const stored = await this.deps.sender.send(new StoreImageCommand(command.userId, command.buffer, command.contentType));
    if (stored.outcome !== 'success' || !stored.image) return { outcome: 'storage_unavailable' };

    const check = BackgroundCheck.upload(this.deps.idGenerator.newId(), command.userId, stored.image.id, now);
    await this.deps.checks.add(check);
    return { outcome: 'created', check: toMyBackgroundCheck(check, stored.image.url, now) };
  }
}
