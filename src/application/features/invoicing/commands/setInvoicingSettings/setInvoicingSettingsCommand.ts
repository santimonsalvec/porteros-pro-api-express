import { ICommand } from '../../../../common/mediator/types.js';

export interface InvoicingSettingsResponse {
  countryId: string;
  provider: string;
  config: Record<string, unknown>;
  /** Whether the provider's credentials for the country exist in the environment; never their values. */
  credentialsPresent: boolean;
  updatedAt: string;
  updatedBy: string;
  /** What the next save must send (admin spec 007, FR-025). */
  revision: number;
}

export type SetInvoicingSettingsResult =
  | { outcome: 'saved'; settings: InvoicingSettingsResponse }
  | { outcome: 'country_not_found' }
  /** Someone saved since `revision` was read, or a create met settings that exist (admin spec 007). */
  | { outcome: 'stale' }
  | { outcome: 'invalid'; fieldErrors: Record<string, string> };

/** An administrator chooses a country's invoicing provider and its non-secret configuration (clarification 6). */
export class SetInvoicingSettingsCommand extends ICommand<SetInvoicingSettingsResult> {
  constructor(
    public readonly adminUserId: string,
    public readonly countryId: string,
    public readonly provider: string,
    public readonly config: Record<string, unknown>,
    /** The revision read; `null` creates the country's first provider (admin spec 007, FR-025). */
    public readonly revision: number | null,
  ) {
    super();
  }
}
