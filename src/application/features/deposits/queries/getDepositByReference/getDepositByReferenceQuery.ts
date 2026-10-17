import type { Language } from '../../../../../domain/i18n/language.js';
import { IQuery } from '../../../../common/mediator/types.js';
import type { DepositStatus } from '../../../../../domain/deposits/deposit.js';

/** Only what the public return page shows: no ids, no goalkeeper, no gateway data. */
export interface DepositReturnView {
  status: DepositStatus;
  amount: number;
  net: number;
  currency: string;
  /** The language the deposit's owner chose (feature 032); null when none. The page never names them. */
  ownerLanguage: Language | null;
}

export type GetDepositByReferenceResult = { outcome: 'success'; deposit: DepositReturnView } | { outcome: 'not_found' };

/** The status of a deposit by its reference, for the page the gateway returns to (research.md §8). Read-only. */
export class GetDepositByReferenceQuery extends IQuery<GetDepositByReferenceResult> {
  constructor(public readonly reference: string) {
    super();
  }
}
