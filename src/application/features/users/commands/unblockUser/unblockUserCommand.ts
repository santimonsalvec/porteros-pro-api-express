import { ICommand } from '../../../../common/mediator/types.js';
import type { BlockingResult } from '../../common/blockingDependencies.js';
import type { UserBlockResult } from '../../common/views.js';

export type UnblockUserResult = { outcome: 'unblocked' | 'replayed'; result: UserBlockResult } | BlockingResult;

/** A member unblocks a user, who can sign in again; a goalkeeper's offers stay off (FR-029). */
export class UnblockUserCommand extends ICommand<UnblockUserResult> {
  constructor(
    readonly actorUserId: string,
    readonly userId: string,
    readonly reason: string,
  ) {
    super();
  }
}
