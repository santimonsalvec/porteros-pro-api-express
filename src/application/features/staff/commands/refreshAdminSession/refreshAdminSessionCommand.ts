import { ICommand } from '../../../../common/mediator/types.js';
import type { IssuedAdminSession } from '../../common/sessionResponse.js';

export type RefreshAdminSessionResult = ({ outcome: 'refreshed' } & IssuedAdminSession) | { outcome: 'invalid_refresh_token' };

/** The admin web's cookie value exchanged for a new access token and a new refresh value. */
export class RefreshAdminSessionCommand extends ICommand<RefreshAdminSessionResult> {
  constructor(readonly refreshToken: string) {
    super();
  }
}
