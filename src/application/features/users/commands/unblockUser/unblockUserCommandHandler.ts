import type { ICommandHandler } from '../../../../common/mediator/types.js';
import { blockReasonIssue } from '../../../../../domain/users/userBlock.js';
import { blockResult, type BlockingDependencies } from '../../common/blockingDependencies.js';
import { UnblockUserCommand, type UnblockUserResult } from './unblockUserCommand.js';

export class UnblockUserCommandHandler implements ICommandHandler<UnblockUserCommand, UnblockUserResult> {
  constructor(private readonly deps: BlockingDependencies) {}

  async handle(command: UnblockUserCommand): Promise<UnblockUserResult> {
    const issue = blockReasonIssue(command.reason);
    if (issue) return { outcome: 'validation_failed', fieldErrors: { reason: issue } };
    if (!(await this.deps.users.getById(command.userId))) return { outcome: 'not_found' };

    const reason = command.reason.trim();
    const written = await this.deps.blocks.unblock(command.userId, command.actorUserId, reason, this.deps.clock.now());
    const profile = await this.deps.profiles.getByUserId(command.userId);
    return {
      outcome: written.outcome === 'changed' ? 'unblocked' : 'replayed',
      result: blockResult(written.record, written.record.unblockReason ?? reason, profile ? profile.availableForOffers : null),
    };
  }
}
