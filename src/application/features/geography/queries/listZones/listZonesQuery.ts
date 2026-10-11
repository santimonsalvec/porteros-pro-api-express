import { IQuery } from '../../../../common/mediator/types.js';
import type { ZoneListItem } from '../../common/views.js';
import type { ZoneCityCheck } from '../../common/zoneChecks.js';

export type ListZonesResult =
  | { outcome: 'ok'; city: { id: string; name: string }; items: ZoneListItem[] }
  | Exclude<ZoneCityCheck, { outcome: 'ok' }>;

/** Every zone of an anchor city, active or not, without polygons: the map reads them apart (`ListZoneShapes`). */
export class ListZonesQuery extends IQuery<ListZonesResult> {
  constructor(readonly cityId: string) {
    super();
  }
}
