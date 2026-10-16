import { IQuery } from '../../../../common/mediator/types.js';
import type { BookingSettingsWithOrigin } from '../../../goalkeeperRequests/common/resolveBookingSettings.js';
import type { CityRuleFields } from '../../common/bookingRules.js';

export interface CityBookingSettingsView {
  cityId: string;
  cityName: string;
  countryId: string | null;
  countryName: string | null;
  currency: string | null;
  /** The city's own values; `null` = inherits. */
  own: CityRuleFields;
  country: CityRuleFields;
  /** What the quote reads here, and from which level (FR-006). */
  effective: BookingSettingsWithOrigin;
  invalid: boolean;
  revision: number | null;
}

export type GetCityBookingSettingsResult =
  | { outcome: 'ok'; settings: CityBookingSettingsView }
  | { outcome: 'not_found' }
  | { outcome: 'city_not_anchor'; anchorCityId: string };

export class GetCityBookingSettingsQuery extends IQuery<GetCityBookingSettingsResult> {
  constructor(readonly cityId: string) {
    super();
  }
}
