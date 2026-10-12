import { IQuery } from '../../../../common/mediator/types.js';
import type { BlockImpact } from '../../common/views.js';

export type GetBlockImpactResult = { outcome: 'ok'; impact: BlockImpact } | { outcome: 'not_found' };

/** What a user has open, shown before blocking them (FR-029). */
export class GetBlockImpactQuery extends IQuery<GetBlockImpactResult> {
  constructor(readonly userId: string) {
    super();
  }
}
