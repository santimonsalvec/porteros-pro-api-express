import { ICommand } from '../../../../common/mediator/types.js';
import type { Warning } from '../../common/warnings.js';

export interface CountryFields {
  name: string;
  countryCode: string;
  dialCode: string;
  currency: string | null;
}

export type SaveCountryResult =
  | { outcome: 'saved'; countryId: string; created: boolean }
  | { outcome: 'not_found' }
  | { outcome: 'stale' }
  | { outcome: 'country_code_taken' }
  | { outcome: 'currency_locked' }
  | { outcome: 'warnings'; warnings: Warning[] };

/** Creates a country, or edits one (admin spec 003, US4). */
export class SaveCountryCommand extends ICommand<SaveCountryResult> {
  /** Use `create` or `edit`. */
  constructor(
    readonly countryId: string | null,
    readonly revision: number,
    readonly fields: Partial<CountryFields>,
    readonly acknowledgeWarnings: boolean,
  ) {
    super();
  }

  static create(fields: CountryFields, acknowledgeWarnings = false): SaveCountryCommand {
    return new SaveCountryCommand(null, 0, fields, acknowledgeWarnings);
  }

  static edit(countryId: string, revision: number, changes: Partial<CountryFields>, acknowledgeWarnings = false): SaveCountryCommand {
    return new SaveCountryCommand(countryId, revision, changes, acknowledgeWarnings);
  }
}
