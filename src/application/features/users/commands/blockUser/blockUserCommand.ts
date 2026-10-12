import { ICommand } from '../../../../common/mediator/types.js';
import type { BlockingResult } from '../../common/blockingDependencies.js';
import type { UserBlockResult } from '../../common/views.js';

export type BlockUserResult = { outcome: 'blocked' | 'replayed'; result: UserBlockResult } | BlockingResult;

/** A member blocks a user: no sign-in, no session renewal and, for a goalkeeper, no offers (FR-026–FR-029). */
export class BlockUserCommand extends ICommand<BlockUserResult> {
  constructor(
    readonly actorUserId: string,
    readonly userId: string,
    readonly reason: string,
  ) {
    super();
  }
}
