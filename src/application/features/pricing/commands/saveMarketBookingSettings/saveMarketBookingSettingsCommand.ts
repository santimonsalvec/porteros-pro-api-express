import { ICommand } from '../../../../common/mediator/types.js';
import type { MarketRuleFields } from '../../common/bookingRules.js';
import type { SaveBookingSettingsResult } from '../saveCountryBookingSettings/saveCountryBookingSettingsCommand.js';

export type SaveMarketBookingSettingsResult = SaveBookingSettingsResult;

/** Replaces what an anchor market overrides (FR-008): `null` = inherits from the country. */
export class SaveMarketBookingSettingsCommand extends ICommand<SaveMarketBookingSettingsResult> {
  constructor(
    readonly marketId: string,
    readonly revision: number | null,
    readonly fields: MarketRuleFields,
    readonly acknowledgeWarnings: boolean,
  ) {
    super();
  }
}
