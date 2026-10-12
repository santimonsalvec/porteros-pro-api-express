import { IQuery } from '../../../../common/mediator/types.js';
import type { GoalkeeperDocumentView } from '../../common/adminViews.js';

export type GetGoalkeeperDocumentResult = { outcome: 'ok'; document: GoalkeeperDocumentView } | { outcome: 'not_a_goalkeeper' };

/** A goalkeeper's identity document: a sensitive read, audited by its route (FR-008). */
export class GetGoalkeeperDocumentQuery extends IQuery<GetGoalkeeperDocumentResult> {
  constructor(readonly userId: string) {
    super();
  }
}
