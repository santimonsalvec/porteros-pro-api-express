import { IQuery } from '../../../../common/mediator/types.js';
import type { RentalRateView } from '../../common/views.js';

export type GetRentalRateResult = { outcome: 'ok'; rate: RentalRateView } | { outcome: 'not_found' };

export class GetRentalRateQuery extends IQuery<GetRentalRateResult> {
  constructor(readonly rateId: string) {
    super();
  }
}
