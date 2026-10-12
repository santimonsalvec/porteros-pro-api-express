import type { ICommandHandler } from '../../../../common/mediator/types.js';
import { removedRequiredSettings } from '../../../../../domain/pricing/effectiveRules.js';
import { needsAcknowledgement, warning } from '../../../geography/common/warnings.js';
import { bufferWarning, checkLevels, cityLevelsOf, settingsFieldErrors } from '../../common/bookingRules.js';
import { PricingGeography, type PricingGeographyDependencies } from '../../common/pricingGeography.js';
import type { IBookingSettingsAdmin } from '../../common/ports.js';
import { SaveCountryBookingSettingsCommand, type SaveBookingSettingsResult } from './saveCountryBookingSettingsCommand.js';

export class SaveCountryBookingSettingsCommandHandler implements ICommandHandler<SaveCountryBookingSettingsCommand, SaveBookingSettingsResult> {
  constructor(private readonly deps: PricingGeographyDependencies & { bookingSettings: IBookingSettingsAdmin }) {}

  async handle({ countryId, revision, fields, acknowledgeWarnings }: SaveCountryBookingSettingsCommand): Promise<SaveBookingSettingsResult> {
    const country = await this.deps.countries.getById(countryId);
    if (!country) return { outcome: 'not_found' };
    const fieldErrors = settingsFieldErrors(fields);
    if (fieldErrors) return { outcome: 'invalid', fieldErrors };

    const geography = await PricingGeography.load(this.deps);
    const cities = await cityLevelsOf(this.deps.bookingSettings, geography, countryId);
    const { violations, bufferLevels } = checkLevels({ name: country.name, fields }, cities, null);
    if (violations.length > 0) return { outcome: 'notice_violation', violations };

    const before = await this.deps.bookingSettings.getByScope('country', countryId);
    const operating = geography.citiesOf(countryId).filter((city) => geography.zones(city.id).length > 0);
    const removed = removedRequiredSettings(before?.fields ?? null, fields).map((field) =>
      warning('required_setting_removed', {
        field,
        operatingCities: operating.filter((city) => cities.find((level) => level.id === city.id)?.fields[field] == null).length,
      }),
    );
    const warnings = [...bufferWarning(bufferLevels), ...removed];
    if (needsAcknowledgement(warnings, acknowledgeWarnings)) return { outcome: 'warnings', warnings };

    const saved = await this.deps.bookingSettings.save('country', countryId, revision, fields);
    return saved === 'saved' ? { outcome: 'saved' } : { outcome: 'stale' };
  }
}
