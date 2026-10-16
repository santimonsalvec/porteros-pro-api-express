import { IQuery } from '../../../../common/mediator/types.js';
import type { ZoneShape } from '../../common/views.js';
import type { ZoneMarketCheck } from '../../common/zoneChecks.js';

export type ListZoneShapesResult = { outcome: 'ok'; items: ZoneShape[] } | Exclude<ZoneMarketCheck, { outcome: 'ok' }>;

/** The polygons of an anchor city's zones, simplified for the admin's map (admin feedback 2026-10-08). */
export class ListZoneShapesQuery extends IQuery<ListZoneShapesResult> {
  constructor(readonly marketId: string) {
    super();
  }
}
