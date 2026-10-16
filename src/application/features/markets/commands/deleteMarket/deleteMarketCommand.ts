import { ICommand } from '../../../../common/mediator/types.js';
import type { MarketUsageKind } from '../../common/marketUsage.js';

export type DeleteMarketResult =
  | { outcome: 'deleted' }
  | { outcome: 'not_found' }
  | { outcome: 'stale' }
  | { outcome: 'in_use'; kind: MarketUsageKind; count: number };

/** Deletes a market nothing points at (spec 031, FR-009a): there is no "close", only this. */
export class DeleteMarketCommand extends ICommand<DeleteMarketResult> {
  constructor(
    readonly marketId: string,
    readonly revision: number,
  ) {
    super();
  }
}
