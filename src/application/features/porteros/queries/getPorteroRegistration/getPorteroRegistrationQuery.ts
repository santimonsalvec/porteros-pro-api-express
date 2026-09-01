import { IQuery } from '../../../../common/mediator/types.js';
import type { PorteroRegistrationResponse } from '../../common/porteroRegistrationResponse.js';

export interface GetPorteroRegistrationResult {
  registration: PorteroRegistrationResponse;
}

/** Always succeeds — a client with no saved data simply gets the `not_started` shape. */
export class GetPorteroRegistrationQuery extends IQuery<GetPorteroRegistrationResult> {
  constructor(public readonly userId: string) {
    super();
  }
}
