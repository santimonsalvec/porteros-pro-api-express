import { ICommand } from '../../../../common/mediator/types.js';
import type { UserPushResult } from '../../common/ports.js';

export type SendTestPushResult =
  | { outcome: 'sent'; result: UserPushResult }
  | { outcome: 'rate_limited'; retryAfterSeconds: number };

/** A push to the caller's own devices, to verify the chain end to end (Story 6). */
export class SendTestPushCommand extends ICommand<SendTestPushResult> {
  constructor(readonly userId: string) {
    super();
  }
}
