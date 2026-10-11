import { IQuery } from '../../../../common/mediator/types.js';
import type { ZoneView } from '../../common/views.js';

export type GetZoneResult = { outcome: 'ok'; zone: ZoneView } | { outcome: 'not_found' };

export class GetZoneQuery extends IQuery<GetZoneResult> {
  constructor(readonly zoneId: string) {
    super();
  }
}
