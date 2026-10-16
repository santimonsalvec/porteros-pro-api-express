import { describe, expect, it } from 'vitest';
import { testMarket } from '../../../../fakes/fakeMarketRepository.js';
import { CommissionSetting } from '../../../../../src/domain/operatingBalance/commissionSetting.js';
import { compareNames, compareTiers } from '../../../../../src/application/features/pricing/common/ordering.js';
import { PricingGeography, checkWriteTarget } from '../../../../../src/application/features/pricing/common/pricingGeography.js';
import { GetMarketBookingSettingsQuery } from '../../../../../src/application/features/pricing/queries/getMarketBookingSettings/getMarketBookingSettingsQuery.js';
import { GetMarketBookingSettingsQueryHandler } from '../../../../../src/application/features/pricing/queries/getMarketBookingSettings/getMarketBookingSettingsQueryHandler.js';
import { ListCommissionsQuery } from '../../../../../src/application/features/pricing/queries/listCommissions/listCommissionsQuery.js';
import { ListCommissionsQueryHandler } from '../../../../../src/application/features/pricing/queries/listCommissions/listCommissionsQueryHandler.js';
import { GetCommissionDeleteImpactQuery } from '../../../../../src/application/features/pricing/queries/getCommissionDeleteImpact/getCommissionDeleteImpactQuery.js';
import { GetCommissionDeleteImpactQueryHandler } from '../../../../../src/application/features/pricing/queries/getCommissionDeleteImpact/getCommissionDeleteImpactQueryHandler.js';
import { GetRentalRateDeleteImpactQuery } from '../../../../../src/application/features/pricing/queries/getRentalRateDeleteImpact/getRentalRateDeleteImpactQuery.js';
import { GetRentalRateDeleteImpactQueryHandler } from '../../../../../src/application/features/pricing/queries/getRentalRateDeleteImpact/getRentalRateDeleteImpactQueryHandler.js';
import { SaveMarketBookingSettingsCommand } from '../../../../../src/application/features/pricing/commands/saveMarketBookingSettings/saveMarketBookingSettingsCommand.js';
import { SaveMarketBookingSettingsCommandHandler } from '../../../../../src/application/features/pricing/commands/saveMarketBookingSettings/saveMarketBookingSettingsCommandHandler.js';
import { RentalRate } from '../../../../../src/domain/pricing/rentalRate.js';
import type { MarketRuleFields } from '../../../../../src/application/features/pricing/common/bookingRules.js';
import { pricingKit } from './pricingTestKit.js';

const NO_CITY_RULES: MarketRuleFields = {
  bookingWindowDays: null,
  minNoticeMinutes: null,
  freeCancellationMinutes: null,
  travelBufferMinutes: null,
  leadTimeSurcharge: null,
  checkInWindow: null,
  noShowGraceMinutes: null,
  offerReminderIntervalMinutes: null,
  offerMaxReminders: null,
};

describe('pricing edge cases', () => {
  it('orders empty names last and keeps equal tiers together', () => {
    expect(['b', null, 'a', null].sort(compareNames)).toEqual(['a', 'b', null, null]);
    expect(compareTiers({ modality: 'futbol_11' }, { modality: 'futbol_11' })).toBe(0);
  });

  it('reads a market whose country is gone, without a country part', async () => {
    const kit = pricingKit();
    kit.markets.seed(testMarket({ id: 'orphan', name: 'Huérfana', countryId: 'gone' }));
    const result = await new GetMarketBookingSettingsQueryHandler(kit).handle(new GetMarketBookingSettingsQuery('orphan'));
    expect(result).toMatchObject({ outcome: 'ok', settings: { countryName: null, currency: null, revision: null } });
    expect(await checkWriteTarget(kit, 'market', 'orphan')).toEqual({ outcome: 'country_without_currency' });
    expect(await new SaveMarketBookingSettingsCommandHandler(kit).handle(new SaveMarketBookingSettingsCommand('orphan', null, NO_CITY_RULES, false))).toEqual({ outcome: 'saved' });
  });

  it('refuses a save on an unknown market, and a broken value', async () => {
    const kit = pricingKit();
    const save = (marketId: string, fields = NO_CITY_RULES) => new SaveMarketBookingSettingsCommandHandler(kit).handle(new SaveMarketBookingSettingsCommand(marketId, null, fields, false));
    expect(await save('med', { ...NO_CITY_RULES, bookingWindowDays: 0 })).toEqual({ outcome: 'invalid', fieldErrors: { bookingWindowDays: 'out_of_range' } });
    expect(await new GetMarketBookingSettingsQueryHandler(kit).handle(new GetMarketBookingSettingsQuery('nowhere'))).toEqual({ outcome: 'not_found' });
  });

  it('marks a target that is gone: a country, a city or a zone of a missing city', async () => {
    const kit = pricingKit();
    const geography = await PricingGeography.load(kit);
    expect(geography.target('country', 'pe').valid).toBe(false);
    expect(geography.target('market', 'nowhere').valid).toBe(false);
    expect(geography.target('zone', 'nowhere').valid).toBe(false);
    expect(geography.target('market', 'env').valid).toBe(false);
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
    kit.commissions.base.seed(new CommissionSetting({ id: 'c-med', scope: 'market', refId: 'med', amount: 8000 }));
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
