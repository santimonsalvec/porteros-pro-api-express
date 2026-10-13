import type { ICommandHandler } from '../../../../common/mediator/types.js';
import { blockReasonIssue } from '../../../../../domain/users/userBlock.js';
import { blockResult, type BlockingDependencies } from '../../common/blockingDependencies.js';
import { BlockUserCommand, type BlockUserResult } from './blockUserCommand.js';

/**
 * Blocks the user and, if a goalkeeper, turns their offers off (FR-029); their open requests and
 * accepted bookings stay as they are, for support to resolve. Repeating it changes nothing.
 */
export class BlockUserCommandHandler implements ICommandHandler<BlockUserCommand, BlockUserResult> {
  constructor(private readonly deps: BlockingDependencies) {}

  async handle(command: BlockUserCommand): Promise<BlockUserResult> {
    const issue = blockReasonIssue(command.reason);
    if (issue) return { outcome: 'validation_failed', fieldErrors: { reason: issue } };
    if (!(await this.deps.users.getById(command.userId))) return { outcome: 'not_found' };

    const reason = command.reason.trim();
    const written = await this.deps.blocks.block(command.userId, command.actorUserId, reason, this.deps.clock.now());
    const isGoalkeeper = (await this.deps.profiles.getByUserId(command.userId)) !== null;
    // Also on a repeat: a goalkeeper must never stay blocked with the offers on.
    if (isGoalkeeper) await this.deps.profiles.setAvailableForOffers(command.userId, false);
    return {
      outcome: written.outcome === 'changed' ? 'blocked' : 'replayed',
      result: blockResult(written.record, written.record.blockReason ?? reason, isGoalkeeper ? false : null),
    };
  }
}
