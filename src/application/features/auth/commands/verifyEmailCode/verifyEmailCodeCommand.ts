import { ICommand } from '../../../../common/mediator/types.js';
import type { VerificationFailure } from '../../../../../domain/auth/loginCode.js';
import type { TokenPairResponse } from '../../common/dtos.js';

export type VerifyEmailCodeResult =
  | { outcome: 'success'; tokens: TokenPairResponse }
  | { outcome: VerificationFailure }
  | { outcome: 'too_many_requests'; retryAfterSeconds: number }
  | { outcome: 'account_blocked' };

/** The app's sign-in with the code sent to an address (admin spec 009, US1). */
export class VerifyEmailCodeCommand extends ICommand<VerifyEmailCodeResult> {
  constructor(
    readonly email: string,
    readonly code: string,
    readonly ip: string,
  ) {
    super();
  }
}
