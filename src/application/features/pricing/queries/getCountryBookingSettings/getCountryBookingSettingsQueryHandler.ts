import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { IAdminCountryRepository } from '../../../geography/common/ports.js';
import { EMPTY_SETTINGS, SETTING_DEFAULTS } from '../../common/bookingRules.js';
import type { IBookingSettingsAdmin } from '../../common/ports.js';
import { GetCountryBookingSettingsQuery, type GetCountryBookingSettingsResult } from './getCountryBookingSettingsQuery.js';

export class GetCountryBookingSettingsQueryHandler implements IQueryHandler<GetCountryBookingSettingsQuery, GetCountryBookingSettingsResult> {
  constructor(private readonly deps: { countries: IAdminCountryRepository; bookingSettings: IBookingSettingsAdmin }) {}

  async handle({ countryId }: GetCountryBookingSettingsQuery): Promise<GetCountryBookingSettingsResult> {
    const country = await this.deps.countries.getById(countryId);
    if (!country) return { outcome: 'not_found' };
    const record = await this.deps.bookingSettings.getByScope('country', countryId);
    return {
      outcome: 'ok',
      settings: {
        countryId,
        countryName: country.name,
        currency: country.currency,
        own: record?.fields ?? EMPTY_SETTINGS,
        defaults: SETTING_DEFAULTS,
        invalid: record?.invalid ?? false,
        revision: record?.revision ?? null,
      },
    };
  }
}
