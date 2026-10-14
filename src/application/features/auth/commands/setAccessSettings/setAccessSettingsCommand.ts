import { ICommand } from '../../../../common/mediator/types.js';
import type { AccessSettingsResponse } from '../../common/accessSettingsResponse.js';

export type SetAccessSettingsResult =
  | { outcome: 'saved'; settings: AccessSettingsResponse }
  | { outcome: 'invalid'; fieldErrors: Record<string, string> }
  | { outcome: 'stale' };

/** A new expiry for the next sign-in codes, at the revision the member read (admin spec 009, FR-025). */
export class SetAccessSettingsCommand extends ICommand<SetAccessSettingsResult> {
  constructor(
    readonly userId: string,
    readonly loginCodeExpiryMinutes: unknown,
    readonly revision: number,
  ) {
    super();
  }
}
