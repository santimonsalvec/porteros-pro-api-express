import type { IInvoicingSecrets, InvoicingCredentials } from '../../application/features/invoicing/common/ports.js';

/**
 * A provider's credentials for a country from environment variables named
 * `{PROVIDER}_{COUNTRY}_USERNAME` and `…_ACCESS_KEY` (e.g. `SIIGO_CO_USERNAME`), which App Hosting
 * fills from Secret Manager (research.md §7). Never logged.
 */
export class EnvInvoicingSecrets implements IInvoicingSecrets {
  constructor(private readonly env: Readonly<Record<string, string | undefined>>) {}

  forProvider(provider: string, countryCode: string): InvoicingCredentials | null {
    const prefix = `${provider}_${countryCode}`.toUpperCase();
    const username = this.env[`${prefix}_USERNAME`]?.trim();
    const accessKey = this.env[`${prefix}_ACCESS_KEY`]?.trim();
    return username && accessKey ? { username, accessKey } : null;
  }
}
