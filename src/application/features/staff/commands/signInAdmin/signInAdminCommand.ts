import { ICommand } from '../../../../common/mediator/types.js';
import type { IssuedAdminSession } from '../../common/sessionResponse.js';

export type SignInAdminResult =
  | ({ outcome: 'signed_in' } & IssuedAdminSession)
  | { outcome: 'invalid_credential' }
  | { outcome: 'unauthorized_admin_account' };

/** A Google ID token exchanged for an admin web session (porteros-pro-admin spec 001). */
export class SignInAdminCommand extends ICommand<SignInAdminResult> {
  constructor(
    readonly credential: string,
    readonly userAgent: string,
    readonly ip: string,
  ) {
    super();
  }
}
