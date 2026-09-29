import { IQuery } from '../../../../common/mediator/types.js';
import type { TaxSettingsResponse } from '../../commands/setTaxSettings/setTaxSettingsCommand.js';

export type GetTaxSettingsResult = { outcome: 'success'; settings: TaxSettingsResponse } | { outcome: 'not_found' };

export class GetTaxSettingsQuery extends IQuery<GetTaxSettingsResult> {
  constructor(public readonly countryId: string) {
    super();
  }
}
