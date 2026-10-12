import { IQuery } from '../../../../common/mediator/types.js';
import type { UserDetail } from '../../common/views.js';

export type GetUserResult = { outcome: 'ok'; user: UserDetail } | { outcome: 'not_found' };

/** A user's detail for the admin, without the phone number (contracts §1). */
export class GetUserQuery extends IQuery<GetUserResult> {
  constructor(readonly userId: string) {
    super();
  }
}
