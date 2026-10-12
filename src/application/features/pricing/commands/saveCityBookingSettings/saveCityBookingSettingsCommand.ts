import { ICommand } from '../../../../common/mediator/types.js';
import type { CityRuleFields } from '../../common/bookingRules.js';
import type { SaveBookingSettingsResult } from '../saveCountryBookingSettings/saveCountryBookingSettingsCommand.js';

export type SaveCityBookingSettingsResult = SaveBookingSettingsResult | { outcome: 'city_not_anchor'; anchorCityId: string };

/** Replaces what an anchor city overrides (FR-008): `null` = inherits from the country. */
export class SaveCityBookingSettingsCommand extends ICommand<SaveCityBookingSettingsResult> {
  constructor(
    readonly cityId: string,
    readonly revision: number | null,
    readonly fields: CityRuleFields,
    readonly acknowledgeWarnings: boolean,
  ) {
    super();
  }
}
