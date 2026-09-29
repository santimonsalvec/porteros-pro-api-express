import { ICommand } from '../../../../common/mediator/types.js';

export interface AcceptCurrentTermsResult {
  termsVersion: string;
  privacyPolicyVersion: string;
  acceptedAt: string;
}

/** The signed-in user accepts the current terms and privacy policy (feature 022, research.md §10). */
export class AcceptCurrentTermsCommand extends ICommand<AcceptCurrentTermsResult> {
  constructor(
    public readonly userId: string,
    public readonly ipAddress: string | null,
    public readonly userAgent: string | null,
  ) {
    super();
  }
}
