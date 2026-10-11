import { IQuery } from '../../../../common/mediator/types.js';
import type { ZoneShape } from '../../common/views.js';
import type { ZoneCityCheck } from '../../common/zoneChecks.js';

export type ListZoneShapesResult = { outcome: 'ok'; items: ZoneShape[] } | Exclude<ZoneCityCheck, { outcome: 'ok' }>;

/** The polygons of an anchor city's zones, simplified for the admin's map (admin feedback 2026-10-08). */
export class ListZoneShapesQuery extends IQuery<ListZoneShapesResult> {
  constructor(readonly cityId: string) {
    super();
  }
}
