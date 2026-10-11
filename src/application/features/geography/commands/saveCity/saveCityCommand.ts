import { ICommand } from '../../../../common/mediator/types.js';
import type { Warning } from '../../common/warnings.js';

export interface CityFields {
  name: string;
  regionId: string;
  timeZone: string | null;
  zoneCityId: string | null;
  daneStateCode: string | null;
  daneCityCode: string | null;
}

export type SaveCityResult =
  | { outcome: 'saved'; cityId: string; created: boolean }
  | { outcome: 'not_found' }
  | { outcome: 'stale' }
  | { outcome: 'invalid'; fieldErrors: Record<string, string> }
  | { outcome: 'city_has_zones' }
  | { outcome: 'warnings'; warnings: Warning[] };

/**
 * Creates a city, or edits one over what is stored (admin spec 003, US1). An edit carries the
 * `revision` it read; `acknowledgeWarnings` confirms the warnings of a previous attempt.
 */
export class SaveCityCommand extends ICommand<SaveCityResult> {
  /** Use `create` or `edit`. */
  constructor(
    readonly cityId: string | null,
    readonly revision: number,
    readonly fields: Partial<CityFields>,
    readonly acknowledgeWarnings: boolean,
  ) {
    super();
  }

  static create(fields: CityFields, acknowledgeWarnings = false): SaveCityCommand {
    return new SaveCityCommand(null, 0, fields, acknowledgeWarnings);
  }

  static edit(cityId: string, revision: number, changes: Partial<CityFields>, acknowledgeWarnings = false): SaveCityCommand {
    return new SaveCityCommand(cityId, revision, changes, acknowledgeWarnings);
  }
}
