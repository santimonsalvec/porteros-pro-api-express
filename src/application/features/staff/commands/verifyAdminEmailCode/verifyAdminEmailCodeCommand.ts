import { ICommand } from '../../../../common/mediator/types.js';
import type { VerificationFailure } from '../../../../../domain/auth/loginCode.js';
import type { IssuedAdminSession } from '../../common/sessionResponse.js';

export type VerifyAdminEmailCodeResult =
  | ({ outcome: 'signed_in' } & IssuedAdminSession)
  | { outcome: VerificationFailure }
  | { outcome: 'too_many_requests'; retryAfterSeconds: number };

/** The admin web's sign-in with the code sent to a member's address (admin spec 009, US3). */
export class VerifyAdminEmailCodeCommand extends ICommand<VerifyAdminEmailCodeResult> {
  constructor(
    readonly email: string,
    readonly code: string,
    readonly userAgent: string,
    readonly ip: string,
  ) {
    super();
  }
}
