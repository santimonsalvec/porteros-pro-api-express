import { ICommand } from '../../../../common/mediator/types.js';

export type SignOutAdminResult = { outcome: 'signed_out' };

/** Ends the admin web session of one browser (its cookie value); the member's other browsers stay in. */
export class SignOutAdminCommand extends ICommand<SignOutAdminResult> {
  constructor(readonly refreshToken: string | null) {
    super();
  }
}
