import type { IQueryHandler } from '../../../../common/mediator/types.js';
import { marketPart, EMPTY_SETTINGS, effectiveRules } from '../../common/bookingRules.js';
import type { PricingGeographyDependencies } from '../../common/pricingGeography.js';
import type { IBookingSettingsAdmin } from '../../common/ports.js';
import type { OfferReminderValues } from '../../../notifications/common/offerReminders.js';
import { GetMarketBookingSettingsQuery, type GetMarketBookingSettingsResult } from './getMarketBookingSettingsQuery.js';

export class GetMarketBookingSettingsQueryHandler implements IQueryHandler<GetMarketBookingSettingsQuery, GetMarketBookingSettingsResult> {
  constructor(private readonly deps: PricingGeographyDependencies & { bookingSettings: IBookingSettingsAdmin; platformReminders?: OfferReminderValues }) {}

  async handle({ marketId }: GetMarketBookingSettingsQuery): Promise<GetMarketBookingSettingsResult> {
    const market = await this.deps.markets.getById(marketId);
    if (!market) return { outcome: 'not_found' };
    const countryId = market.countryId;
    const [country, own, inherited] = await Promise.all([
      countryId ? this.deps.countries.getById(countryId) : null,
      this.deps.bookingSettings.getByScope('market', marketId),
      countryId ? this.deps.bookingSettings.getByScope('country', countryId) : null,
    ]);
    return {
      outcome: 'ok',
      settings: {
        marketId,
        marketName: market.name,
        countryId,
        countryName: country?.name ?? null,
        currency: country?.currency ?? null,
        own: marketPart(own?.fields ?? EMPTY_SETTINGS),
        country: marketPart(inherited?.fields ?? EMPTY_SETTINGS),
        effective: effectiveRules(own, inherited, this.deps.platformReminders),
        invalid: own?.invalid ?? false,
        revision: own?.revision ?? null,
      },
    };
  }
}
