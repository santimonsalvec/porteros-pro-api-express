import { ICommand } from '../../../../common/mediator/types.js';
import type { UserAuditView } from '../../common/userAuditViews.js';

export interface ContactCorrection {
  firstName?: string;
  lastName?: string;
  /** ISO code; comes with `whatsAppNumber`. */
  countryCode?: string;
  whatsAppNumber?: string;
}

export type UpdateUserContactResult =
  | { outcome: 'corrected'; audit: UserAuditView }
  | { outcome: 'not_found' }
  | { outcome: 'profile_incomplete' }
  | { outcome: 'validation_failed'; fieldErrors: Record<string, string> }
  | { outcome: 'invalid_country_code' }
  | { outcome: 'duplicate_phone_number' }
  | { outcome: 'stale' };

/** An administrator corrects a user's name or WhatsApp with the app's own rules (FR-005). */
export class UpdateUserContactCommand extends ICommand<UpdateUserContactResult> {
  constructor(
    readonly userId: string,
    readonly version: string,
    readonly correction: ContactCorrection,
  ) {
    super();
  }
}
