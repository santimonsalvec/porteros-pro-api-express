import { ICommand } from '../../../../common/mediator/types.js';
import type { TokenPairResponse } from '../../../auth/common/dtos.js';

export type CompleteProfileOutcome =
  | 'success'
  | 'validation_failed'
  | 'already_complete'
  | 'invalid_country_code'
  | 'duplicate_phone_number';

export interface CompleteProfileResult {
  outcome: CompleteProfileOutcome;
  tokens?: TokenPairResponse;
  fieldErrors?: Record<string, string>;
}

export class CompleteProfileCommand extends ICommand<CompleteProfileResult> {
  constructor(
    public readonly userId: string,
    public readonly firstName: string,
    public readonly lastName: string,
    public readonly countryCode: string,
    public readonly whatsAppNumber: string,
    public readonly acceptedTerms: boolean,
    public readonly ipAddress: string | null,
    public readonly userAgent: string | null,
  ) {
    super();
  }
}
