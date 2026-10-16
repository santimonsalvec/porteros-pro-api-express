import { ICommand } from '../../../../common/mediator/types.js';
import type { MarketFields } from '../../common/marketFields.js';

export type CreateMarketResult =
  | { outcome: 'created'; marketId: string }
  | { outcome: 'invalid'; fieldErrors: Record<string, string> }
  | { outcome: 'country_not_found' }
  | { outcome: 'country_without_currency' }
  | { outcome: 'market_name_taken' };

/** Creates a market in `draft` (spec 031, FR-001). */
export class CreateMarketCommand extends ICommand<CreateMarketResult> {
  constructor(
    readonly fields: MarketFields,
    readonly createdBy: string,
  ) {
    super();
  }
}
