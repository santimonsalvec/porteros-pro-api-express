import { IQuery } from '../../../../common/mediator/types.js';
import type { DeleteImpact } from '../../common/deleteImpact.js';

export type DeleteImpactResult = { outcome: 'ok'; impact: DeleteImpact } | { outcome: 'not_found' };

/** Which active zones stop quoting this rate's duration if it is deleted (FR-018). */
export class GetRentalRateDeleteImpactQuery extends IQuery<DeleteImpactResult> {
  constructor(readonly rateId: string) {
    super();
  }
}
