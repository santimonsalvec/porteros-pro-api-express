import { ICommand } from '../../../../common/mediator/types.js';

/** A municipality of the billing catalog (spec 031): it no longer says anything about operation. */
export interface CityFields {
  name: string;
  regionId: string;
  daneStateCode: string | null;
  daneCityCode: string | null;
}

export type SaveCityResult =
  | { outcome: 'saved'; cityId: string; created: boolean }
  | { outcome: 'not_found' }
  | { outcome: 'stale' }
  | { outcome: 'invalid'; fieldErrors: Record<string, string> };

/**
 * Creates a municipality, or edits one over what is stored (admin spec 003, US1; spec 031). An
 * edit carries the `revision` it read.
 */
export class SaveCityCommand extends ICommand<SaveCityResult> {
  /** Use `create` or `edit`. */
  constructor(
    readonly cityId: string | null,
    readonly revision: number,
    readonly fields: Partial<CityFields>,
  ) {
    super();
  }

  static create(fields: CityFields): SaveCityCommand {
    return new SaveCityCommand(null, 0, fields);
  }

  static edit(cityId: string, revision: number, changes: Partial<CityFields>): SaveCityCommand {
    return new SaveCityCommand(cityId, revision, changes);
  }
}
