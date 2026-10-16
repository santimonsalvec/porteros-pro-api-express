import { IQuery } from '../../../../common/mediator/types.js';
import type { ZoneListItem } from '../../common/views.js';
import type { ZoneMarketCheck } from '../../common/zoneChecks.js';

export type ListZonesResult =
  | { outcome: 'ok'; market: { id: string; name: string }; items: ZoneListItem[] }
  | Exclude<ZoneMarketCheck, { outcome: 'ok' }>;

/** Every zone of a market, active or not, without polygons: the map reads them apart (`ListZoneShapes`). */
export class ListZonesQuery extends IQuery<ListZonesResult> {
  constructor(readonly marketId: string) {
    super();
  }
}
