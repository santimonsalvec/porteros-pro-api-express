import { IQuery } from '../../../../common/mediator/types.js';

/** What the environment says (read in infrastructure): values and whether each secret is there. */
export interface SystemParameterValues {
  values: { name: string; value: string | number | boolean; isDefault: boolean }[];
  secrets: { name: string; present: boolean }[];
}

export interface CountryCredentials {
  countryId: string;
  countryCode: string;
  countryName: string;
  gateway: { name: string; present: boolean } | null;
  invoicingProvider: { name: string; present: boolean } | null;
}

export type SystemParametersResult = SystemParameterValues & { countryCredentials: CountryCredentials[] };

/** The server's read-only parameters for Sistema (contracts/dashboard-system-api.md §5). */
export class GetSystemParametersQuery extends IQuery<SystemParametersResult> {}
