import { ICommand } from '../../../../common/mediator/types.js';
import type { MapCenter } from '../../../../../domain/markets/market.js';

export interface MarketEdits {
  name?: string;
  timeZone?: string;
  mapCenter?: MapCenter;
  /** Never accepted: a market's country is fixed (FR-001a). */
  countryId?: string;
}

export type UpdateMarketResult =
  | { outcome: 'saved' }
  | { outcome: 'not_found' }
  | { outcome: 'stale' }
  | { outcome: 'invalid'; fieldErrors: Record<string, string> }
  | { outcome: 'country_immutable' }
  | { outcome: 'market_name_taken' };

/** Edits a market's name, time zone or map centre at the revision read (spec 031, FR-001a). */
export class UpdateMarketCommand extends ICommand<UpdateMarketResult> {
  constructor(
    readonly marketId: string,
    readonly revision: number,
    readonly edits: MarketEdits,
  ) {
    super();
  }
}
