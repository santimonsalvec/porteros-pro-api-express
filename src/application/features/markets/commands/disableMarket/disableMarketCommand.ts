import { ICommand } from '../../../../common/mediator/types.js';

export type DisableMarketResult =
  | { outcome: 'disabled' }
  | { outcome: 'not_found' }
  | { outcome: 'stale' }
  | { outcome: 'not_enabled' }
  | { outcome: 'reason_required' };

/**
 * Stops new requests in a market (spec 031, FR-009). What is already booked or searching goes on
 * as it was. The reason is kept in the audit log.
 */
export class DisableMarketCommand extends ICommand<DisableMarketResult> {
  constructor(
    readonly marketId: string,
    readonly revision: number,
    readonly reason: string | null,
    readonly disabledBy: string,
  ) {
    super();
  }
}
