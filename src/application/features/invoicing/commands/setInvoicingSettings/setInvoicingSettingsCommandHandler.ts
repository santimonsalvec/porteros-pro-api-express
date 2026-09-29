import type { IClock } from '../../../../common/clock.js';
import type { ICommandHandler } from '../../../../common/mediator/types.js';
import { InvoicingSettings, type InvoicingProviderName } from '../../../../../domain/invoicing/invoicingSettings.js';
import type { ICountryLookup } from '../../../goalkeeperRequests/common/ports.js';
import type { IInvoicingLogger, IInvoicingSecrets, IInvoicingSettingsRepository } from '../../common/ports.js';
import { SetInvoicingSettingsCommand, type InvoicingSettingsResponse, type SetInvoicingSettingsResult } from './setInvoicingSettingsCommand.js';

export function toInvoicingSettingsResponse(settings: InvoicingSettings, credentialsPresent: boolean): InvoicingSettingsResponse {
  return {
    countryId: settings.countryId,
    provider: settings.provider,
    config: { ...settings.config },
    credentialsPresent,
    updatedAt: settings.updatedAt.toISOString(),
    updatedBy: settings.updatedBy,
  };
}

/** "config.sellerId: must be a positive integer" → { 'config.sellerId': 'must be a positive integer' }. */
function toFieldErrors(problems: string[]): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const problem of problems) {
    const separator = problem.indexOf(': ');
    errors[separator > 0 ? problem.slice(0, separator) : 'settings'] ??= separator > 0 ? problem.slice(separator + 2) : problem;
  }
  return errors;
}

export class SetInvoicingSettingsCommandHandler implements ICommandHandler<SetInvoicingSettingsCommand, SetInvoicingSettingsResult> {
  constructor(
    private readonly countryLookup: ICountryLookup,
    private readonly repository: IInvoicingSettingsRepository,
    private readonly secrets: IInvoicingSecrets,
    private readonly clock: IClock,
    private readonly logger: IInvoicingLogger,
  ) {}

  async handle(command: SetInvoicingSettingsCommand): Promise<SetInvoicingSettingsResult> {
    const country = await this.countryLookup.getById(command.countryId);
    if (!country) return { outcome: 'country_not_found' };
    const created = InvoicingSettings.create({
      countryId: country.id,
      provider: command.provider as InvoicingProviderName,
      config: command.config,
      updatedAt: this.clock.now(),
      updatedBy: command.adminUserId,
    });
    if (!created.ok) return { outcome: 'invalid', fieldErrors: toFieldErrors(created.problems) };
    const previous = await this.repository.getByCountry(country.id);
    await this.repository.save(created.settings);
    const credentialsPresent = this.secrets.forProvider(created.settings.provider, country.countryCode) !== null;
    this.logger.info(
      { outcome: 'invoicing_settings_saved', countryId: country.id, adminUserId: command.adminUserId, provider: created.settings.provider, previousProvider: previous?.provider ?? null, credentialsPresent },
      'Invoicing provider settings saved',
    );
    return { outcome: 'saved', settings: toInvoicingSettingsResponse(created.settings, credentialsPresent) };
  }
}
