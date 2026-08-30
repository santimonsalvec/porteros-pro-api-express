import { IQuery } from '../../../../common/mediator/types.js';
import type { ClientProfileResponse } from '../../common/clientProfileResponse.js';

export type GetClientProfileOutcome = 'success' | 'not_found';

export interface GetClientProfileResult {
  outcome: GetClientProfileOutcome;
  profile?: ClientProfileResponse;
}

export class GetClientProfileQuery extends IQuery<GetClientProfileResult> {
  constructor(public readonly userId: string) {
    super();
  }
}
