import { IQuery } from '../../../../common/mediator/types.js';
import type { StoredBookingSettings } from '../../common/ports.js';
import type { SettingDefaults } from '../../common/bookingRules.js';

export interface CountryBookingSettingsView {
  countryId: string;
  countryName: string;
  currency: string | null;
  own: StoredBookingSettings;
  defaults: SettingDefaults;
  invalid: boolean;
  /** `null` while the country has no rules saved yet. */
  revision: number | null;
}

export type GetCountryBookingSettingsResult = { outcome: 'ok'; settings: CountryBookingSettingsView } | { outcome: 'not_found' };

export class GetCountryBookingSettingsQuery extends IQuery<GetCountryBookingSettingsResult> {
  constructor(readonly countryId: string) {
    super();
  }
}
