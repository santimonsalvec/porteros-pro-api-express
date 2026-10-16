import { IQuery } from '../../../../common/mediator/types.js';
import type { MapCenter } from '../../../../../domain/markets/market.js';

/** A market as the app shows it: where to center the map and how to read its times. */
export interface AppMarket {
  id: string;
  name: string;
  countryId: string;
  timeZone: string;
  mapCenter: MapCenter;
}

/** The markets clients and goalkeepers may pick, by name (spec 031, FR-021, contract A1). */
export class ListEnabledMarketsQuery extends IQuery<{ markets: AppMarket[] }> {}
