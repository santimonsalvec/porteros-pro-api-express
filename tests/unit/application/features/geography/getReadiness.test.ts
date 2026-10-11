import { describe, expect, it } from 'vitest';
import { BookingSettings } from '../../../../../src/domain/pricing/bookingSettings.js';
import { CommissionSetting } from '../../../../../src/domain/wallet/commissionSetting.js';
import { RentalRate } from '../../../../../src/domain/pricing/rentalRate.js';
import { GetReadinessQuery } from '../../../../../src/application/features/geography/queries/getReadiness/getReadinessQuery.js';
import { GetReadinessQueryHandler } from '../../../../../src/application/features/geography/queries/getReadiness/getReadinessQueryHandler.js';
import { ReadinessSummarizer } from '../../../../../src/application/features/geography/common/readiness.js';
import { FakeBookingSettingsRepository } from '../../../../fakes/fakeBookingSettingsRepository.js';
import { FakeCommissionSettingRepository } from '../../../../fakes/fakeCommissionSettingRepository.js';
import { FakeDocumentTypeRepository } from '../../../../fakes/fakeDocumentTypeRepository.js';
import { FakeInvoicingSettingsRepository } from '../../../../fakes/fakeInvoicingSettingsRepository.js';
import { FakePaymentGatewaySettingsRepository } from '../../../../fakes/fakePaymentGatewaySettingsRepository.js';
import { FakeRentalRateRepository } from '../../../../fakes/fakeRentalRateRepository.js';
import { FakeTaxSettingsRepository } from '../../../../fakes/fakeTaxSettingsRepository.js';
import { geographyKit } from './geographyTestKit.js';

function setup() {
  const kit = geographyKit();
  const deps = {
    ...kit,
    bookingSettings: new FakeBookingSettingsRepository(),
    rentalRates: new FakeRentalRateRepository(),
    commissions: new FakeCommissionSettingRepository(),
    taxSettings: new FakeTaxSettingsRepository(),
    gatewaySettings: new FakePaymentGatewaySettingsRepository(),
    invoicingSettings: new FakeInvoicingSettingsRepository(),
    documentTypes: new FakeDocumentTypeRepository(),
  };
  deps.bookingSettings.seed(
    new BookingSettings({ id: 'bs', scope: 'country', refId: 'co', bookingWindowDays: 30, minNoticeMinutes: 60, leadTimeSurcharge: { tiers: [{ fromMinutes: 0, toMinutes: null, amount: 0 }] } }),
  );
  deps.rentalRates.seed(new RentalRate({ id: 'r', scope: 'city', refId: 'med', durationMinutes: 60, amount: 40000 }));
  deps.commissions.seed(new CommissionSetting({ id: 'c', scope: 'country', refId: 'co', amount: 7000 }));
  return { deps, get: (query: GetReadinessQuery) => new GetReadinessQueryHandler(deps).handle(query) };
}

describe('GetReadinessQueryHandler', () => {
  it("a country's dashboard: its items, only its operating cities, and how many are available", async () => {
    const { get } = setup();

    const result = await get(GetReadinessQuery.ofCountry('co'));

    expect(result.outcome).toBe('country');
    if (result.outcome !== 'country') return;
    expect(result.dashboard.country).toMatchObject({ countryId: 'co', name: 'Colombia', ready: false });
    expect(result.dashboard.cities).toEqual([
      { cityId: 'env', name: 'Envigado', regionName: 'Antioquia', ready: false, missingCount: 1 },
      { cityId: 'med', name: 'Medellín', regionName: 'Antioquia', ready: true, missingCount: 0 },
    ]);
    expect(result.dashboard.availableCityCount).toBe(1);
  });

  it("an operating city: its items and its country's", async () => {
    const { get } = setup();

    const result = await get(GetReadinessQuery.ofCity('med'));

    expect(result).toMatchObject({ outcome: 'city', readiness: { cityId: 'med', name: 'Medellín', state: 'operating', ready: true, country: { countryId: 'co' } } });
    expect(result.outcome === 'city' && result.readiness.items.length).toBeGreaterThan(5);
  });

  it('an available city has no checklist', async () => {
    const { get } = setup();
    expect(await get(GetReadinessQuery.ofCity('ita'))).toMatchObject({ outcome: 'city', readiness: { state: 'available', items: [], ready: false } });
  });

  it('says when the country or the city does not exist', async () => {
    const { get } = setup();
    expect(await get(GetReadinessQuery.ofCountry('pe'))).toEqual({ outcome: 'country_not_found' });
    expect(await get(GetReadinessQuery.ofCity('nope'))).toEqual({ outcome: 'city_not_found' });
  });
});

describe('ReadinessSummarizer', () => {
  it('sums up each operating city for the city list', async () => {
    const { deps } = setup();
    const cities = await deps.cities.getByIds(['med', 'env']);

    const summaries = await new ReadinessSummarizer(deps).summarize(cities);

    expect(summaries).toEqual(new Map([['med', { ready: true, missingCount: 0 }], ['env', { ready: false, missingCount: 1 }]]));
  });
});
