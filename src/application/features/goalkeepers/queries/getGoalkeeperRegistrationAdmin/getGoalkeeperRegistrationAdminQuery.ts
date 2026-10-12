import { IQuery } from '../../../../common/mediator/types.js';
import type { RegistrationDetail } from '../../common/adminViews.js';

export type GetGoalkeeperRegistrationAdminResult = { outcome: 'ok'; registration: RegistrationDetail } | { outcome: 'not_found' };

/** What a registration in progress is missing, per section, never the document (FR-016). */
export class GetGoalkeeperRegistrationAdminQuery extends IQuery<GetGoalkeeperRegistrationAdminResult> {
  constructor(readonly userId: string) {
    super();
  }
}
