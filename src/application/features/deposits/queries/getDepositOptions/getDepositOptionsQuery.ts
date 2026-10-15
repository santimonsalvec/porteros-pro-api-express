import { IQuery } from '../../../../common/mediator/types.js';
import type { DepositOption } from '../../../../../domain/payments/gatewaySettings.js';

export type GetDepositOptionsResult =
  | {
      outcome: 'ok';
      /** `false` when the goalkeeper's country has no gateway configured (then `options` is empty). */
      available: boolean;
      gateway: string | null;
      currency: string;
      termsAccepted: boolean;
      termsVersion: string;
      options: DepositOption[];
    }
  | { outcome: 'not_a_goalkeeper' }
  | { outcome: 'operating_balance_not_configured'; cityId: string };

/** The amounts a goalkeeper can deposit, each with its cost and net (contracts §1). */
export class GetDepositOptionsQuery extends IQuery<GetDepositOptionsResult> {
  constructor(public readonly goalkeeperId: string) {
    super();
  }
}
