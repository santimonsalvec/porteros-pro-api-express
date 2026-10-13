import { IQuery } from '../../../../common/mediator/types.js';
import type { DeleteImpactResult } from '../getRentalRateDeleteImpact/getRentalRateDeleteImpactQuery.js';

/** Which active zones are left without any commission (and so are never offered) if this one goes (FR-018). */
export class GetCommissionDeleteImpactQuery extends IQuery<DeleteImpactResult> {
  constructor(readonly commissionId: string) {
    super();
  }
}
