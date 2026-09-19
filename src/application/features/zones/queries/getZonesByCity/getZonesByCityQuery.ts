import { IQuery } from '../../../../common/mediator/types.js';
import type { ZoneGeometry } from '../../../../../domain/zones/zone.js';

export interface ZoneOption {
  id: string;
  name: string;
  slug: string;
  displayOrder: number;
  geometry: ZoneGeometry;
}

export type GetZonesByCityOutcome = 'success' | 'city_not_found' | 'no_zones_configured';

export interface GetZonesByCityResult {
  outcome: GetZonesByCityOutcome;
  zones?: ZoneOption[];
}

export class GetZonesByCityQuery extends IQuery<GetZonesByCityResult> {
  constructor(public readonly cityId: string) {
    super();
  }
}
