import { describe, expect, it } from 'vitest';
import { BookingSettings } from '../../../../../src/domain/pricing/bookingSettings.js';
import { RentalRate } from '../../../../../src/domain/pricing/rentalRate.js';
import { CommissionSetting } from '../../../../../src/domain/operatingBalance/commissionSetting.js';
import { DocumentType } from '../../../../../src/domain/goalkeepers/documentType.js';
import { Country } from '../../../../../src/domain/countries/country.js';
import { Market } from '../../../../../src/domain/markets/market.js';
import { countryReadiness, marketReadiness, readinessForMarkets, type ReadinessDependencies } from '../../../../../src/application/features/geography/common/readiness.js';
import { FakeBookingSettingsRepository } from '../../../../fakes/fakeBookingSettingsRepository.js';
import { FakeCommissionSettingRepository } from '../../../../fakes/fakeCommissionSettingRepository.js';
import { FakeDocumentTypeRepository } from '../../../../fakes/fakeDocumentTypeRepository.js';
import { FakeInvoicingSettingsRepository } from '../../../../fakes/fakeInvoicingSettingsRepository.js';
import { FakePaymentGatewaySettingsRepository } from '../../../../fakes/fakePaymentGatewaySettingsRepository.js';
import { FakeRentalRateRepository } from '../../../../fakes/fakeRentalRateRepository.js';
import { FakeTaxSettingsRepository } from '../../../../fakes/fakeTaxSettingsRepository.js';
import { testMarket } from '../../../../fakes/fakeMarketRepository.js';
import { geographyKit } from './geographyTestKit.js';
import { GetServiceQuoteQuery } from '../../../../../src/application/features/goalkeeperRequests/queries/getServiceQuote/getServiceQuoteQuery.js';
import { GetServiceQuoteQueryHandler } from '../../../../../src/application/features/goalkeeperRequests/queries/getServiceQuote/getServiceQuoteQueryHandler.js';
import { parseStartsAt } from '../../../../../src/application/features/goalkeeperRequests/common/startsAt.js';
import { CommissionResolver } from '../../../../../src/application/features/operatingBalance/common/commissionResolver.js';
import { FakeMatchSurfaceRepository } from '../../../../fakes/fakeMatchSurfaceRepository.js';
import { QUOTE_FORMAT_FIELDS } from '../../../../fixtures/quoteFixtures.js';

/** The market Medellín with everything a quote needs; each test removes what it checks. */
function ready() {
  const kit = geographyKit();
  const deps: ReadinessDependencies & { kit: typeof kit } = {
    kit,
    countries: kit.countries,
    regions: kit.regions,
    zones: kit.zones,
    bookingSettings: new FakeBookingSettingsRepository(),
    rentalRates: new FakeRentalRateRepository(),
    commissions: new FakeCommissionSettingRepository(),
    taxSettings: new FakeTaxSettingsRepository(),
    gatewaySettings: new FakePaymentGatewaySettingsRepository(),
    invoicingSettings: new FakeInvoicingSettingsRepository(),
    documentTypes: new FakeDocumentTypeRepository(),
  };
  (deps.bookingSettings as FakeBookingSettingsRepository).seed(
    new BookingSettings({ id: 'bs-co', scope: 'country', refId: 'co', bookingWindowDays: 30, minNoticeMinutes: 60, leadTimeSurcharge: { tiers: [{ fromMinutes: 0, toMinutes: null, amount: 0 }] } }),
  );
  (deps.rentalRates as FakeRentalRateRepository).seed(new RentalRate({ id: 'r60', scope: 'market', refId: 'med', durationMinutes: 60, amount: 40000 }));
  (deps.rentalRates as FakeRentalRateRepository).seed(new RentalRate({ id: 'r90', scope: 'zone', refId: 'z-laureles', durationMinutes: 90, amount: 55000 }));
  (deps.commissions as FakeCommissionSettingRepository).seed(new CommissionSetting({ id: 'c-co', scope: 'country', refId: 'co', amount: 7000 }));
  (deps.taxSettings as FakeTaxSettingsRepository).seed('co');
  (deps.gatewaySettings as FakePaymentGatewaySettingsRepository).seed({ countryId: 'co' });
  (deps.invoicingSettings as FakeInvoicingSettingsRepository).seed('co');
  (deps.documentTypes as FakeDocumentTypeRepository).seed(new DocumentType({ id: 'cc', code: 'cedula_ciudadania', name: 'Cédula' }));
  return deps;
}

const medellin = (deps: ReturnType<typeof ready>) => deps.kit.markets.markets.get('med')!;

const item = (items: { key: string }[], key: string) => items.find((i) => i.key === key);
const statuses = (items: { key: string; status: string }[]) => Object.fromEntries(items.map((i) => [i.key, i.status]));

describe('marketReadiness (spec 031, FR-008)', () => {
  it('lists the items of §17 in order, all ready, with the optional ones apart', async () => {
    const deps = ready();

    const result = await marketReadiness(deps, medellin(deps));

    expect(result.items.map((i) => i.key)).toEqual([
      'country',
      'time_zone',
      'zones',
      'rental_rates',
      'booking_settings',
      'commission',
      'market_booking_settings',
      'market_commission',
    ]);
    expect(statuses(result.items)).toMatchObject({
      country: 'ok',
      time_zone: 'ok',
      zones: 'ok',
      rental_rates: 'ok',
      booking_settings: 'ok',
      commission: 'ok',
      market_booking_settings: 'optional',
      market_commission: 'optional',
    });
    expect(item(result.items, 'rental_rates')).toMatchObject({ detail: '60 y 90 min', target: { kind: 'admin', screen: 'rentalRates', id: 'med' } });
    expect(item(result.items, 'booking_settings')).toMatchObject({ target: { kind: 'admin', screen: 'bookingSettings', id: 'med' } });
    expect(item(result.items, 'commission')).toMatchObject({ target: { kind: 'admin', screen: 'commissions', id: 'med' } });
    expect(item(result.items, 'zones')).toMatchObject({ detail: '1 zona activa', target: { kind: 'admin', screen: 'zones', id: 'med' } });
    expect(result).toMatchObject({ ready: true, missingCount: 0 });
  });

  it('has no anchor, region or DANE items any more', async () => {
    const deps = ready();
    const keys = (await marketReadiness(deps, medellin(deps))).items.map((i) => i.key);
    expect(keys).not.toContain('region_country');
    expect(keys).not.toContain('dane_codes');
  });

  it.each([
    ['zones', (d: ReturnType<typeof ready>) => d.kit.zones.items.clear()],
    ['zones', (d: ReturnType<typeof ready>) => {
      const zone = d.kit.zones.items.get('z-laureles')!;
      d.kit.zones.items.set('z-laureles', Object.assign(Object.create(Object.getPrototypeOf(zone)), zone, { active: false }));
    }],
    ['rental_rates', (d: ReturnType<typeof ready>) => (d.rentalRates as FakeRentalRateRepository).clear()],
    ['booking_settings', (d: ReturnType<typeof ready>) => (d.bookingSettings as FakeBookingSettingsRepository).clear()],
    ['booking_settings', (d: ReturnType<typeof ready>) => d.kit.countries.items.set('co', new Country({ id: 'co', name: 'Colombia', dialCode: '+57', countryCode: 'CO' }))],
    ['country', (d: ReturnType<typeof ready>) => d.kit.countries.items.clear()],
    ['commission', (d: ReturnType<typeof ready>) => (d.commissions as FakeCommissionSettingRepository).clear()],
  ] as const)('marks %s as missing', async (key, breakIt) => {
    const deps = ready();
    breakIt(deps);

    const result = await marketReadiness(deps, medellin(deps));

    expect(item(result.items, key)).toMatchObject({ status: 'missing' });
    expect(result.ready).toBe(false);
  });

  it('names a stored currency the quote would refuse as a bad value, not as missing data', async () => {
    const deps = ready();
    deps.kit.countries.items.set('co', new Country({ id: 'co', name: 'Colombia', dialCode: '+57', countryCode: 'CO', currency: 'cop' }));

    const result = await marketReadiness(deps, medellin(deps));

    expect(item(result.items, 'booking_settings')).toMatchObject({ status: 'missing', detail: 'Hay un valor inválido en la configuración' });
    expect(result.ready).toBe(false);
  });

  it('marks an invalid time zone as missing', async () => {
    const deps = ready();
    const broken = Market.fromStored({ ...medellin(deps).toProps(), timeZone: 'Mars/Olympus' });
    expect(item((await marketReadiness(deps, broken)).items, 'time_zone')).toMatchObject({ status: 'missing' });
  });

  it('counts market-level rules and commissions as configured when present', async () => {
    const deps = ready();
    (deps.bookingSettings as FakeBookingSettingsRepository).seed(new BookingSettings({ id: 'bs-med', scope: 'market', refId: 'med', minNoticeMinutes: 120 }));
    (deps.commissions as FakeCommissionSettingRepository).seed(new CommissionSetting({ id: 'c-z', scope: 'zone', refId: 'z-laureles', amount: 5000 }));

    const result = await marketReadiness(deps, medellin(deps));

    expect(statuses(result.items)).toMatchObject({ market_booking_settings: 'ok', market_commission: 'ok' });
  });
});

describe('countryReadiness', () => {
  it('lists the country items, all ready', async () => {
    const deps = ready();

    const result = await countryReadiness(deps, (await deps.kit.countries.getById('co'))!);

    expect(result.items.map((i) => [i.key, i.status])).toEqual([
      ['currency', 'ok'],
      ['country_code', 'ok'],
      ['regions', 'ok'],
      ['booking_settings', 'ok'],
      ['commission', 'ok'],
      ['tax', 'ok'],
      ['payment_gateway', 'ok'],
      ['invoicing', 'ok'],
      ['document_types', 'ok'],
    ]);
    expect(result.ready).toBe(true);
  });

  it('points what is missing to its screen or to the guide', async () => {
    const deps = ready();
    deps.kit.countries.items.set('co', new Country({ id: 'co', name: 'Colombia', dialCode: '+57', countryCode: 'CO' }));
    const fresh = { ...deps, taxSettings: new FakeTaxSettingsRepository(), gatewaySettings: new FakePaymentGatewaySettingsRepository(), invoicingSettings: new FakeInvoicingSettingsRepository(), documentTypes: new FakeDocumentTypeRepository() };
    (fresh.documentTypes as FakeDocumentTypeRepository).seed(new DocumentType({ id: 'ti', code: 'tarjeta_identidad', name: 'TI' }));

    const result = await countryReadiness(fresh, (await deps.kit.countries.getById('co'))!);

    expect(item(result.items, 'currency')).toMatchObject({ status: 'missing', target: { kind: 'admin', screen: 'country', id: 'co' } });
    expect(item(result.items, 'tax')).toMatchObject({ status: 'missing', target: { kind: 'admin', screen: 'taxSettings', id: 'co' } });
    expect(item(result.items, 'booking_settings')).toMatchObject({ target: { kind: 'admin', screen: 'countryBookingSettings', id: 'co' } });
    expect(item(result.items, 'commission')).toMatchObject({ target: { kind: 'admin', screen: 'countryCommissions', id: 'co' } });
    expect(item(result.items, 'payment_gateway')).toMatchObject({ status: 'missing', target: { kind: 'guide', section: '§12' } });
    expect(item(result.items, 'invoicing')).toMatchObject({ status: 'missing', target: { kind: 'guide', section: '§13' } });
    expect(item(result.items, 'document_types')).toMatchObject({ status: 'missing', target: { kind: 'admin', screen: 'documentTypes' } });
    expect(result.ready).toBe(false);
  });
});

describe('readiness agrees with the quote (FR-023)', () => {
  /** A quote in Laureles, through the real quote handler over the same data. */
  function quote(deps: ReturnType<typeof ready>) {
    const { kit } = deps;
    const handler = new GetServiceQuoteQueryHandler(
      kit.zones.base,
      kit.markets,
      kit.countries,
      deps.rentalRates as FakeRentalRateRepository,
      deps.bookingSettings as FakeBookingSettingsRepository,
      new CommissionResolver(deps.commissions, kit.zones.base, kit.markets),
      kit.clock,
      new FakeMatchSurfaceRepository(),
    );
    return handler.handle(
      new GetServiceQuoteQuery({
        latitude: 6.25,
        longitude: -75.59,
        startsAt: parseStartsAt('2026-10-09T15:00:00')!,
        goalkeeperCount: 1,
        durationMinutes: 60,
        ...QUOTE_FORMAT_FIELDS,
      }),
    );
  }

  it('a ready market quotes', async () => {
    const deps = ready();
    expect((await marketReadiness(deps, medellin(deps))).ready).toBe(true);
    expect((await quote(deps)).outcome).toBe('success');
  });

  it.each([
    ['rates', (d: ReturnType<typeof ready>) => (d.rentalRates as FakeRentalRateRepository).clear()],
    ['booking rules', (d: ReturnType<typeof ready>) => (d.bookingSettings as FakeBookingSettingsRepository).clear()],
    ['commission', (d: ReturnType<typeof ready>) => (d.commissions as FakeCommissionSettingRepository).clear()],
    ['zones', (d: ReturnType<typeof ready>) => d.kit.zones.items.clear()],
  ] as const)('a market missing its %s is not ready, and does not quote', async (_label, breakIt) => {
    const deps = ready();
    breakIt(deps);
    expect((await marketReadiness(deps, medellin(deps))).ready).toBe(false);
    expect((await quote(deps)).outcome).not.toBe('success');
  });
});

describe('readinessForMarkets reads in batches (Atlas latency, admin feedback 2026-10-08)', () => {
  /** Counts the calls to every method of every dependency. */
  function counting(deps: ReturnType<typeof ready>) {
    const calls: Record<string, number> = {};
    const wrap = <T extends object>(name: string, target: T): T =>
      new Proxy(target, {
        get(object, key) {
          const value = Reflect.get(object, key);
          if (typeof value !== 'function') return value;
          return (...args: unknown[]) => {
            calls[`${name}.${String(key)}`] = (calls[`${name}.${String(key)}`] ?? 0) + 1;
            return (value as (...a: unknown[]) => unknown).apply(object, args);
          };
        },
      });
    const counted = {
      ...deps,
      countries: wrap('countries', deps.countries),
      zones: wrap('zones', deps.zones),
      bookingSettings: wrap('bookingSettings', deps.bookingSettings),
      rentalRates: wrap('rentalRates', deps.rentalRates),
      commissions: wrap('commissions', deps.commissions),
    };
    return { counted, calls };
  }

  it('answers several markets with one read per source, whatever their number', async () => {
    const deps = ready();
    const markets = [medellin(deps), testMarket({ id: 'bog', name: 'Bogotá', countryId: 'co' })];
    const { counted, calls } = counting(deps);

    const results = await readinessForMarkets(counted, markets);

    expect([...results.keys()].sort()).toEqual(['bog', 'med']);
    expect(results.get('med')).toMatchObject({ ready: true });
    for (const [method, count] of Object.entries(calls)) expect(count, method).toBeLessThanOrEqual(1);
    expect(calls['rentalRates.findForDuration']).toBeUndefined();
    expect(calls['bookingSettings.findFor']).toBeUndefined();
  });

  it('agrees with the one-market answer', async () => {
    const deps = ready();
    const bogota = testMarket({ id: 'bog', name: 'Bogotá', countryId: 'co' });
    const batch = await readinessForMarkets(deps, [medellin(deps), bogota]);

    expect(batch.get('bog')).toEqual(await marketReadiness(deps, bogota));
    expect(batch.get('med')).toEqual(await marketReadiness(deps, medellin(deps)));
  });
});
