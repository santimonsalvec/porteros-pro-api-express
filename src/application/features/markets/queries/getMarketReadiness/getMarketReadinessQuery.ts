import { IQuery } from '../../../../common/mediator/types.js';
import type { ReadinessResult } from '../../../geography/common/readiness.js';

export type GetMarketReadinessResult = { outcome: 'ok'; readiness: ReadinessResult } | { outcome: 'not_found' };

/** A market's checklist, item by item (spec 031, contract §C). */
export class GetMarketReadinessQuery extends IQuery<GetMarketReadinessResult> {
  constructor(readonly marketId: string) {
    super();
  }
}
