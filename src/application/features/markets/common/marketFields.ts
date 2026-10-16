import { marketFieldIssues, type MapCenter } from '../../../../domain/markets/market.js';
import { isValidTimeZone } from '../../goalkeeperRequests/common/zonedTime.js';

export interface MarketFields {
  name: string;
  countryId: string;
  timeZone: string;
  mapCenter: MapCenter;
}

/** The field errors of a market's fields, `null` when they are valid (FR-001). */
export function marketFieldErrors(fields: MarketFields): Record<string, string> | null {
  const errors: Record<string, string> = Object.fromEntries(marketFieldIssues(fields).map((field) => [field, 'invalid']));
  if (!errors.timeZone && !isValidTimeZone(fields.timeZone)) errors.timeZone = 'invalid_time_zone';
  return Object.keys(errors).length > 0 ? errors : null;
}
