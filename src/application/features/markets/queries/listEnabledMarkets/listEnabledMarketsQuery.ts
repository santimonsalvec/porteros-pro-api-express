import { IQuery } from '../../../../common/mediator/types.js';

/** A market as the app shows it: its country and how to read its times. */
export interface AppMarket {
  id: string;
  name: string;
  countryId: string;
  timeZone: string;
}

/** The markets clients and goalkeepers may pick, by name (spec 031, FR-021, contract A1). */
export class ListEnabledMarketsQuery extends IQuery<{ markets: AppMarket[] }> {}
