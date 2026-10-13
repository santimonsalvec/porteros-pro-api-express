import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { IAdminCountryRepository } from '../../../geography/common/ports.js';
import type { IInvoicingSecrets, IInvoicingSettingsRepository } from '../../../invoicing/common/ports.js';
import type { IPaymentGatewaySettingsRepository, IPaymentSecrets } from '../../../payments/common/ports.js';
import { GetSystemParametersQuery, type CountryCredentials, type SystemParameterValues, type SystemParametersResult } from './getSystemParametersQuery.js';

const ALL_COUNTRIES = { page: 1, pageSize: 1000 };

export interface SystemParametersDependencies {
  parameters: () => SystemParameterValues;
  countries: Pick<IAdminCountryRepository, 'list'>;
  gatewaySettings: Pick<IPaymentGatewaySettingsRepository, 'getByCountry'>;
  invoicingSettings: Pick<IInvoicingSettingsRepository, 'getByCountry'>;
  paymentSecrets: IPaymentSecrets;
  invoicingSecrets: IInvoicingSecrets;
}

/**
 * The server's parameters and, per configured country, whether its gateway's and its invoicing
 * provider's credentials are loaded (the same check as `credentialsPresent` of admin spec 007).
 * Only `present` leaves this handler: the credentials themselves are dropped right here.
 */
export class GetSystemParametersQueryHandler implements IQueryHandler<GetSystemParametersQuery, SystemParametersResult> {
  constructor(private readonly deps: SystemParametersDependencies) {}

  async handle(_query: GetSystemParametersQuery): Promise<SystemParametersResult> {
    const countries = (await this.deps.countries.list(ALL_COUNTRIES)).items;
    const rows = await Promise.all(
      countries.map(async (country): Promise<CountryCredentials | null> => {
        const [gateway, invoicing] = await Promise.all([this.deps.gatewaySettings.getByCountry(country.id), this.deps.invoicingSettings.getByCountry(country.id)]);
        if (!gateway && !invoicing) return null;
        return {
          countryId: country.id,
          countryCode: country.countryCode,
          countryName: country.name,
          gateway: gateway ? { name: gateway.gateway, present: this.deps.paymentSecrets.forGateway(gateway.gateway, country.countryCode) !== null } : null,
          invoicingProvider: invoicing ? { name: invoicing.provider, present: this.deps.invoicingSecrets.forProvider(invoicing.provider, country.countryCode) !== null } : null,
        };
      }),
    );
    return { ...this.deps.parameters(), countryCredentials: rows.filter((row): row is CountryCredentials => row !== null) };
  }
}
