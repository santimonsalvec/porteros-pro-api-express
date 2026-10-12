import { describe, expect, it } from 'vitest';
import { City } from '../../../../../src/domain/locations/city.js';
import { Region } from '../../../../../src/domain/locations/region.js';
import { CommissionSetting } from '../../../../../src/domain/wallet/commissionSetting.js';
import { compareNames, compareTiers } from '../../../../../src/application/features/pricing/common/ordering.js';
import { PricingGeography, checkWriteTarget } from '../../../../../src/application/features/pricing/common/pricingGeography.js';
import { GetCityBookingSettingsQuery } from '../../../../../src/application/features/pricing/queries/getCityBookingSettings/getCityBookingSettingsQuery.js';
import { GetCityBookingSettingsQueryHandler } from '../../../../../src/application/features/pricing/queries/getCityBookingSettings/getCityBookingSettingsQueryHandler.js';
import { ListCommissionsQuery } from '../../../../../src/application/features/pricing/queries/listCommissions/listCommissionsQuery.js';
import { ListCommissionsQueryHandler } from '../../../../../src/application/features/pricing/queries/listCommissions/listCommissionsQueryHandler.js';
import { GetCommissionDeleteImpactQuery } from '../../../../../src/application/features/pricing/queries/getCommissionDeleteImpact/getCommissionDeleteImpactQuery.js';
import { GetCommissionDeleteImpactQueryHandler } from '../../../../../src/application/features/pricing/queries/getCommissionDeleteImpact/getCommissionDeleteImpactQueryHandler.js';
import { GetRentalRateDeleteImpactQuery } from '../../../../../src/application/features/pricing/queries/getRentalRateDeleteImpact/getRentalRateDeleteImpactQuery.js';
import { GetRentalRateDeleteImpactQueryHandler } from '../../../../../src/application/features/pricing/queries/getRentalRateDeleteImpact/getRentalRateDeleteImpactQueryHandler.js';
import { SaveCityBookingSettingsCommand } from '../../../../../src/application/features/pricing/commands/saveCityBookingSettings/saveCityBookingSettingsCommand.js';
import { SaveCityBookingSettingsCommandHandler } from '../../../../../src/application/features/pricing/commands/saveCityBookingSettings/saveCityBookingSettingsCommandHandler.js';
import { RentalRate } from '../../../../../src/domain/pricing/rentalRate.js';
import type { CityRuleFields } from '../../../../../src/application/features/pricing/common/bookingRules.js';
import { pricingKit } from './pricingTestKit.js';

const NO_CITY_RULES: CityRuleFields = { bookingWindowDays: null, minNoticeMinutes: null, freeCancellationMinutes: null, travelBufferMinutes: null, leadTimeSurcharge: null };

describe('pricing edge cases', () => {
  it('orders empty names last and keeps equal tiers together', () => {
    expect(['b', null, 'a', null].sort(compareNames)).toEqual(['a', 'b', null, null]);
    expect(compareTiers({ modality: 'futbol_11', level: null }, { modality: 'futbol_11', level: null })).toBe(0);
  });

  it('reads a city whose region has no country, without a country part', async () => {
    const kit = pricingKit();
    kit.regions.items.set('lost', new Region({ id: 'lost', name: 'Sin país', countryId: null }));
    kit.cities.items.set('orphan', new City({ id: 'orphan', name: 'Huérfana', regionId: 'lost', zoneCityId: null }));
    const result = await new GetCityBookingSettingsQueryHandler(kit).handle(new GetCityBookingSettingsQuery('orphan'));
    expect(result).toMatchObject({ outcome: 'ok', settings: { countryId: null, countryName: null, currency: null, revision: null } });
    expect(await checkWriteTarget(kit, 'city', 'orphan')).toEqual({ outcome: 'country_without_currency' });
    expect(await new SaveCityBookingSettingsCommandHandler(kit).handle(new SaveCityBookingSettingsCommand('orphan', null, NO_CITY_RULES, false))).toEqual({ outcome: 'saved' });
  });

  it('refuses a save on a satellite or unknown city, and a broken value', async () => {
    const kit = pricingKit();
    const save = (cityId: string, fields = NO_CITY_RULES) => new SaveCityBookingSettingsCommandHandler(kit).handle(new SaveCityBookingSettingsCommand(cityId, null, fields, false));
    expect(await save('med', { ...NO_CITY_RULES, bookingWindowDays: 0 })).toEqual({ outcome: 'invalid', fieldErrors: { bookingWindowDays: 'out_of_range' } });
    expect(await new GetCityBookingSettingsQueryHandler(kit).handle(new GetCityBookingSettingsQuery('nowhere'))).toEqual({ outcome: 'not_found' });
  });

  it('marks a target that is gone: a country, a city or a zone of a missing city', async () => {
    const kit = pricingKit();
    const geography = await PricingGeography.load(kit);
    expect(geography.target('country', 'pe').valid).toBe(false);
    expect(geography.target('city', 'nowhere').valid).toBe(false);
    expect(geography.target('zone', 'nowhere').valid).toBe(false);
    expect(geography.target('city', 'env').valid).toBe(false);
    expect(geography.countryOf('nowhere')).toBeNull();
  });

  it('lists a commission whose target is gone, with no VAT country', async () => {
    const kit = pricingKit();
    kit.commissions.base.seed(new CommissionSetting({ id: 'ghost', scope: 'zone', refId: 'deleted-zone', amount: 5000 }));
    const result = await new ListCommissionsQueryHandler(kit).handle(new ListCommissionsQuery({}, 1, 20));
    expect(result.items[0]).toMatchObject({ id: 'ghost', targetValid: false, vatRateBps: 0, totalWithVat: 5000 });
  });

  it('weighs the delete of a commission of a city, and of a target that is gone', async () => {
    const kit = pricingKit();
    kit.commissions.base.seed(new CommissionSetting({ id: 'c-med', scope: 'city', refId: 'med', amount: 8000 }));
    kit.commissions.base.seed(new CommissionSetting({ id: 'ghost', scope: 'zone', refId: 'deleted-zone', amount: 5000 }));
    const impact = (id: string) => new GetCommissionDeleteImpactQueryHandler(kit).handle(new GetCommissionDeleteImpactQuery(id));
    expect(await impact('c-med')).toEqual({ outcome: 'ok', impact: { zoneCount: 3, zoneNames: ['Laureles', 'Bello', 'El Poblado'] } });
    expect(await impact('ghost')).toEqual({ outcome: 'ok', impact: { zoneCount: 0, zoneNames: [] } });
  });

  it('weighs the delete of a rate whose zone is gone as losing nothing', async () => {
    const kit = pricingKit();
    kit.rentalRates.base.seed(new RentalRate({ id: 'ghost', scope: 'zone', refId: 'deleted-zone', durationMinutes: 60, amount: 1 }));
    expect(await new GetRentalRateDeleteImpactQueryHandler(kit).handle(new GetRentalRateDeleteImpactQuery('ghost'))).toEqual({ outcome: 'ok', impact: { zoneCount: 0, zoneNames: [] } });
  });
});
