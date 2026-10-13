import { ICommand } from '../../../../common/mediator/types.js';
import type { TokenPairResponse } from '../../common/dtos.js';

/** `account_blocked`: the administration blocked this user (porteros-pro-admin spec 005). */
export type RefreshAccessTokenOutcome = 'success' | 'invalid_refresh_token' | 'account_blocked';

export interface RefreshAccessTokenResult {
  outcome: RefreshAccessTokenOutcome;
  tokens?: TokenPairResponse;
}

export class RefreshAccessTokenCommand extends ICommand<RefreshAccessTokenResult> {
  constructor(public readonly refreshToken: string) {
    super();
  }
}
