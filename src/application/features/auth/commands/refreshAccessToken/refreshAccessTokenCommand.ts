import { ICommand } from '../../../../common/mediator/types.js';
import type { TokenPairResponse } from '../../common/dtos.js';

export type RefreshAccessTokenOutcome = 'success' | 'invalid_refresh_token';

export interface RefreshAccessTokenResult {
  outcome: RefreshAccessTokenOutcome;
  tokens?: TokenPairResponse;
}

export class RefreshAccessTokenCommand extends ICommand<RefreshAccessTokenResult> {
  constructor(public readonly refreshToken: string) {
    super();
  }
}
