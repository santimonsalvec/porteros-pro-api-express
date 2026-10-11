import type { ICommandHandler } from '../../../../common/mediator/types.js';
import type { IIdGenerator } from '../../../auth/common/ports.js';
import { Country } from '../../../../../domain/countries/country.js';
import type { IAdminCountryRepository, IReferenceUsage } from '../../common/ports.js';
import { needsAcknowledgement, warning, type Warning } from '../../common/warnings.js';
import { SaveCountryCommand, type CountryFields, type SaveCountryResult } from './saveCountryCommand.js';

export class SaveCountryCommandHandler implements ICommandHandler<SaveCountryCommand, SaveCountryResult> {
  constructor(private readonly deps: { countries: IAdminCountryRepository; usage: IReferenceUsage; ids: IIdGenerator }) {}

  async handle(command: SaveCountryCommand): Promise<SaveCountryResult> {
    const stored = command.countryId === null ? null : await this.deps.countries.getById(command.countryId);
    if (command.countryId !== null && !stored) return { outcome: 'not_found' };

    const id = stored?.id ?? this.deps.ids.newId();
    const fields = { ...(stored ? fieldsOf(stored) : {}), ...command.fields } as CountryFields;
    fields.countryCode = fields.countryCode.toUpperCase();

    const sameCode = await this.deps.countries.findByCode(fields.countryCode);
    if (sameCode && sameCode.id !== id) return { outcome: 'country_code_taken' };
    // The currency of a country with wallets, top-ups or bookings never changes (clarification 3).
    if (stored && fields.currency !== stored.currency && (await this.deps.usage.countryOperates(stored.id))) return { outcome: 'currency_locked' };

    const warnings: Warning[] =
      stored && fields.countryCode !== stored.countryCode ? [warning('country_code_changes_secrets', { from: stored.countryCode, to: fields.countryCode })] : [];
    if (needsAcknowledgement(warnings, command.acknowledgeWarnings)) return { outcome: 'warnings', warnings };

    const country = new Country({ id, ...fields, revision: stored ? command.revision : 0 });
    if (!stored) {
      await this.deps.countries.create(country);
      return { outcome: 'saved', countryId: id, created: true };
    }
    const result = await this.deps.countries.update(country);
    return result === 'saved' ? { outcome: 'saved', countryId: id, created: false } : { outcome: 'stale' };
  }
}

function fieldsOf(country: Country): CountryFields {
  return { name: country.name, countryCode: country.countryCode, dialCode: country.dialCode, currency: country.currency };
}
