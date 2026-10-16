import { describe, expect, it } from 'vitest';
import { BookingSettings } from '../../../../../src/domain/pricing/bookingSettings.js';
import { CommissionSetting } from '../../../../../src/domain/operatingBalance/commissionSetting.js';
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
import { testMarket } from '../../../../fakes/fakeMarketRepository.js';
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
  deps.rentalRates.seed(new RentalRate({ id: 'r', scope: 'market', refId: 'med', durationMinutes: 60, amount: 40000 }));
  deps.commissions.seed(new CommissionSetting({ id: 'c', scope: 'country', refId: 'co', amount: 7000 }));
  return { deps, get: (query: GetReadinessQuery) => new GetReadinessQueryHandler(deps).handle(query) };
}

describe('GetReadinessQueryHandler (spec 031)', () => {
  it("a country's dashboard: its items and every market with its summary", async () => {
    const { deps, get } = setup();
    deps.markets.seed(testMarket({ id: 'bog', name: 'Bogotá', countryId: 'co', status: 'draft' }));

    const result = await get(GetReadinessQuery.ofCountry('co'));

    expect(result.outcome).toBe('country');
    if (result.outcome !== 'country') return;
    expect(result.dashboard.country).toMatchObject({ countryId: 'co', name: 'Colombia', ready: false });
    expect(result.dashboard.markets).toEqual([
      { marketId: 'bog', name: 'Bogotá', status: 'draft', ready: false, missingCount: 2 },
      { marketId: 'med', name: 'Medellín', status: 'enabled', ready: true, missingCount: 0 },
    ]);
  });

  it("a market: its items, its status and its country's", async () => {
    const { get } = setup();

    const result = await get(GetReadinessQuery.ofMarket('med'));

    expect(result).toMatchObject({ outcome: 'market', readiness: { marketId: 'med', name: 'Medellín', status: 'enabled', ready: true, country: { countryId: 'co' } } });
    expect(result.outcome === 'market' && result.readiness.items.length).toBeGreaterThan(5);
  });

  it('says when the country or the market does not exist', async () => {
    const { get } = setup();
    expect(await get(GetReadinessQuery.ofCountry('pe'))).toEqual({ outcome: 'country_not_found' });
    expect(await get(GetReadinessQuery.ofMarket('nope'))).toEqual({ outcome: 'market_not_found' });
  });
});

describe('ReadinessSummarizer', () => {
  it('sums up each market for the market list', async () => {
    const { deps } = setup();
    const markets = [deps.markets.markets.get('med')!, testMarket({ id: 'bog', name: 'Bogotá', countryId: 'co' })];

    const summaries = await new ReadinessSummarizer(deps).summarize(markets);

    expect(summaries).toEqual(new Map([['med', { ready: true, missingCount: 0 }], ['bog', { ready: false, missingCount: 2 }]]));
  });
});
