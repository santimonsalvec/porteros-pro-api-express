import { IQuery } from '../../../../common/mediator/types.js';
import type { TopUpStatus } from '../../../../../domain/payments/topUp.js';

/** Only what the public return page shows: no ids, no goalkeeper, no gateway data. */
export interface TopUpReturnView {
  status: TopUpStatus;
  amount: number;
  net: number;
  currency: string;
}

export type GetTopUpByReferenceResult = { outcome: 'success'; topUp: TopUpReturnView } | { outcome: 'not_found' };

/** The status of a top-up by its reference, for the page the gateway returns to (research.md §8). Read-only. */
export class GetTopUpByReferenceQuery extends IQuery<GetTopUpByReferenceResult> {
  constructor(public readonly reference: string) {
    super();
  }
}
