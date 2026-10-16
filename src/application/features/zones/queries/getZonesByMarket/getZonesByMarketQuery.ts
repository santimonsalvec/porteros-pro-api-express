import { IQuery } from '../../../../common/mediator/types.js';
import type { ZoneGeometry } from '../../../../../domain/zones/zone.js';

export interface ZoneOption {
  id: string;
  name: string;
  slug: string;
  displayOrder: number;
  geometry: ZoneGeometry;
}

export type GetZonesByMarketOutcome = 'success' | 'market_not_found' | 'no_zones_configured';

export interface GetZonesByMarketResult {
  outcome: GetZonesByMarketOutcome;
  zones?: ZoneOption[];
}

/** The active zones of an enabled market, for the goalkeeper's availability (spec 031, contract A2). */
export class GetZonesByMarketQuery extends IQuery<GetZonesByMarketResult> {
  constructor(public readonly marketId: string) {
    super();
  }
}
