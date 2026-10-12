import { IQuery } from '../../../../common/mediator/types.js';
import type { UserAuditView } from '../../common/userAuditViews.js';

/** A user as the audit log keeps it: the "before" of a correction (research §8). */
export class GetUserAuditQuery extends IQuery<UserAuditView | null> {
  constructor(readonly userId: string) {
    super();
  }
}
