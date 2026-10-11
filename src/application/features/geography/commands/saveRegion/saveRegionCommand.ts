import { ICommand } from '../../../../common/mediator/types.js';

export interface RegionFields {
  name: string;
  countryId: string;
}

export type SaveRegionResult =
  | { outcome: 'saved'; regionId: string; created: boolean }
  | { outcome: 'not_found' }
  | { outcome: 'stale' }
  | { outcome: 'invalid'; fieldErrors: Record<string, string> };

/** Creates a region of a country, or edits one (admin spec 003, US4). */
export class SaveRegionCommand extends ICommand<SaveRegionResult> {
  /** Use `create` or `edit`. */
  constructor(
    readonly regionId: string | null,
    readonly revision: number,
    readonly fields: Partial<RegionFields>,
  ) {
    super();
  }

  static create(fields: RegionFields): SaveRegionCommand {
    return new SaveRegionCommand(null, 0, fields);
  }

  static edit(regionId: string, revision: number, changes: Partial<RegionFields>): SaveRegionCommand {
    return new SaveRegionCommand(regionId, revision, changes);
  }
}
