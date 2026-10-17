import { ICommand } from '../../../../common/mediator/types.js';
import type { Language } from '../../../../../domain/i18n/language.js';
import type { UserPushResult } from '../../common/ports.js';

export type SendTestPushResult =
  | { outcome: 'sent'; result: UserPushResult }
  | { outcome: 'rate_limited'; retryAfterSeconds: number };

/**
 * A push to the caller's own devices, to verify the chain end to end (Story 6), worded in the
 * caller's language (feature 032): the account's, else `requestLanguage` (the call's
 * `Accept-Language`), else Spanish.
 */
export class SendTestPushCommand extends ICommand<SendTestPushResult> {
  constructor(
    readonly userId: string,
    readonly requestLanguage: Language | null = null,
  ) {
    super();
  }
}
