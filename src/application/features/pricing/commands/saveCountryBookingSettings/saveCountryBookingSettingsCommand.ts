import { ICommand } from '../../../../common/mediator/types.js';
import type { NoticeViolation } from '../../../../../domain/pricing/effectiveRules.js';
import type { Warning } from '../../../geography/common/warnings.js';
import type { StoredBookingSettings } from '../../common/ports.js';

export type SaveBookingSettingsResult =
  | { outcome: 'saved' }
  | { outcome: 'not_found' }
  | { outcome: 'stale' }
  | { outcome: 'invalid'; fieldErrors: Record<string, string> }
  | { outcome: 'notice_violation'; violations: NoticeViolation[] }
  | { outcome: 'warnings'; warnings: Warning[] };

/**
 * Replaces a country's booking rules (admin spec 004, US2): `null` = not set. Refused when it
 * leaves the country or one of its anchor cities with a notice not above its buffer (FR-010).
 */
export class SaveCountryBookingSettingsCommand extends ICommand<SaveBookingSettingsResult> {
  constructor(
    readonly countryId: string,
    /** `null` when the country has no rules yet. */
    readonly revision: number | null,
    readonly fields: StoredBookingSettings,
    readonly acknowledgeWarnings: boolean,
  ) {
    super();
  }
}
