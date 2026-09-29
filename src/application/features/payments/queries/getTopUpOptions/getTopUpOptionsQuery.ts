import { IQuery } from '../../../../common/mediator/types.js';
import type { TopUpOption } from '../../../../../domain/payments/gatewaySettings.js';

export type GetTopUpOptionsResult =
  | {
      outcome: 'ok';
      /** `false` when the goalkeeper's country has no gateway configured (then `options` is empty). */
      available: boolean;
      gateway: string | null;
      currency: string;
      termsAccepted: boolean;
      termsVersion: string;
      options: TopUpOption[];
    }
  | { outcome: 'not_a_goalkeeper' }
  | { outcome: 'wallet_not_configured'; cityId: string };

/** The amounts a goalkeeper can top up, each with its cost and net (contracts §1). */
export class GetTopUpOptionsQuery extends IQuery<GetTopUpOptionsResult> {
  constructor(public readonly goalkeeperId: string) {
    super();
  }
}
