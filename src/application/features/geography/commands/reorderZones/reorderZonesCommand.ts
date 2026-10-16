import { ICommand } from '../../../../common/mediator/types.js';
import type { ZoneMarketCheck } from '../../common/zoneChecks.js';

/** A zone as the admin read it: the order is refused if any changed since. */
export interface ZoneOrderEntry {
  id: string;
  revision: number;
}

export type ReorderZonesResult =
  | { outcome: 'reordered'; zoneIds: string[] }
  | { outcome: 'stale' }
  | Exclude<ZoneMarketCheck, { outcome: 'ok' }>;

/**
 * Puts a market's zones in the order the app shows them (`displayOrder` 1, 2, 3…), dragged in the
 * admin's zone list. `zones` is every zone of the market, in the new order: a list that misses one,
 * adds one or holds an old revision is `stale`, so a concurrent edit is never overwritten.
 */
export class ReorderZonesCommand extends ICommand<ReorderZonesResult> {
  constructor(
    readonly marketId: string,
    readonly zones: ZoneOrderEntry[],
  ) {
    super();
  }
}
