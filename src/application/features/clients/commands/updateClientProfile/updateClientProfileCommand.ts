import { ICommand } from '../../../../common/mediator/types.js';
import type { ClientProfileResponse } from '../../common/clientProfileResponse.js';

export type UpdateClientProfileOutcome =
  | 'success'
  | 'validation_failed'
  | 'invalid_country_code'
  | 'duplicate_phone_number'
  | 'profile_not_complete'
  | 'not_found';

export interface UpdateClientProfileResult {
  outcome: UpdateClientProfileOutcome;
  profile?: ClientProfileResponse;
  fieldErrors?: Record<string, string>;
}

export class UpdateClientProfileCommand extends ICommand<UpdateClientProfileResult> {
  constructor(
    public readonly userId: string,
    public readonly firstName: string,
    public readonly lastName: string,
    public readonly countryCode: string,
    public readonly whatsAppNumber: string,
  ) {
    super();
  }
}
