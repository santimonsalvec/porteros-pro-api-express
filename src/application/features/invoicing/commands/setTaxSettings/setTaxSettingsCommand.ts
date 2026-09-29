import { ICommand } from '../../../../common/mediator/types.js';

export interface TaxSettingsResponse {
  countryId: string;
  vatRateBps: number;
  vatRatePercent: number;
  updatedAt: string;
  updatedBy: string;
}

export type SetTaxSettingsResult =
  | { outcome: 'saved'; settings: TaxSettingsResponse }
  | { outcome: 'country_not_found' }
  | { outcome: 'invalid'; fieldErrors: Record<string, string> };

/** An administrator sets a country's VAT rate; it applies to charges made afterwards (FR-015). */
export class SetTaxSettingsCommand extends ICommand<SetTaxSettingsResult> {
  constructor(
    public readonly adminUserId: string,
    public readonly countryId: string,
    public readonly vatRateBps: number,
  ) {
    super();
  }
}
