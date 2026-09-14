import { IQuery } from '../../../../common/mediator/types.js';
import type { GoalkeeperRegistrationResponse } from '../../common/goalkeeperRegistrationResponse.js';

export interface GetGoalkeeperRegistrationResult {
  registration: GoalkeeperRegistrationResponse;
}

/** Always succeeds — a client with no saved data simply gets the `not_started` shape. */
export class GetGoalkeeperRegistrationQuery extends IQuery<GetGoalkeeperRegistrationResult> {
  constructor(public readonly userId: string) {
    super();
  }
}
