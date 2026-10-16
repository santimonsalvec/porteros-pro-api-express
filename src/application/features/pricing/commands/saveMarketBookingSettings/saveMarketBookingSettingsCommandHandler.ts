import type { ICommandHandler } from '../../../../common/mediator/types.js';
import { needsAcknowledgement } from '../../../geography/common/warnings.js';
import { asNoticeRules, bufferWarning, checkLevels, EMPTY_SETTINGS, settingsFieldErrors, withCityRules } from '../../common/bookingRules.js';
import type { PricingGeographyDependencies } from '../../common/pricingGeography.js';
import type { IBookingSettingsAdmin } from '../../common/ports.js';
import { SaveCityBookingSettingsCommand, type SaveCityBookingSettingsResult } from './saveCityBookingSettingsCommand.js';

export class SaveCityBookingSettingsCommandHandler implements ICommandHandler<SaveCityBookingSettingsCommand, SaveCityBookingSettingsResult> {
  constructor(private readonly deps: PricingGeographyDependencies & { bookingSettings: IBookingSettingsAdmin }) {}

  async handle({ cityId, revision, fields, acknowledgeWarnings }: SaveCityBookingSettingsCommand): Promise<SaveCityBookingSettingsResult> {
    const city = await this.deps.cities.getById(cityId);
    if (!city) return { outcome: 'not_found' };
    if (city.zoneCityId !== null) return { outcome: 'city_not_anchor', anchorCityId: city.zoneCityId };
    const stored = withCityRules(fields);
    const fieldErrors = settingsFieldErrors(stored);
    if (fieldErrors) return { outcome: 'invalid', fieldErrors };

    const countryId = (await this.deps.regions.getById(city.regionId))?.countryId ?? null;
    const country = countryId ? await this.deps.bookingSettings.getByScope('country', countryId) : null;
    const countryName = countryId ? ((await this.deps.countries.getById(countryId))?.name ?? '') : '';
    const level = { id: city.id, name: city.name, rules: asNoticeRules(stored) };
    const { violations, bufferLevels } = checkLevels({ name: countryName, fields: country?.fields ?? EMPTY_SETTINGS }, [level], city.id);
    if (violations.length > 0) return { outcome: 'notice_violation', violations };
    const warnings = bufferWarning(bufferLevels);
    if (needsAcknowledgement(warnings, acknowledgeWarnings)) return { outcome: 'warnings', warnings };

    const saved = await this.deps.bookingSettings.save('city', cityId, revision, stored);
    return saved === 'saved' ? { outcome: 'saved' } : { outcome: 'stale' };
  }
}
