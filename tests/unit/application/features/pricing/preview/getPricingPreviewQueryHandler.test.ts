import { beforeEach, describe, expect, it } from 'vitest';
import { CommissionSetting } from '../../../../../../src/domain/operatingBalance/commissionSetting.js';
import { RentalRate } from '../../../../../../src/domain/pricing/rentalRate.js';
import { Zone } from '../../../../../../src/domain/zones/zone.js';
import { GetPricingPreviewQuery, type PricingPreviewInput } from '../../../../../../src/application/features/pricing/queries/getPricingPreview/getPricingPreviewQuery.js';
import { GetPricingPreviewQueryHandler } from '../../../../../../src/application/features/pricing/queries/getPricingPreview/getPricingPreviewQueryHandler.js';
import { previewWorld } from './previewWorld.js';

let world: ReturnType<typeof previewWorld>;
const preview = (input: Partial<PricingPreviewInput> = {}) =>
  new GetPricingPreviewQueryHandler(world).handle(
    new GetPricingPreviewQuery({
      zoneId: 'zone-cali-norte',
      durationMinutes: 60,
      modality: 'futbol_11',
      level: 'competitive',
      startsAtLocal: '2026-09-21T14:00',
      quoteFromLocal: null,
      ...input,
    }),
  );

beforeEach(() => {
  world = previewWorld();
});

describe('GetPricingPreviewQuery (admin spec 004, US4)', () => {
  it('breaks the price down with where each value comes from, and says it can be quoted', async () => {
    const result = await preview();
    expect(result).toEqual({
      outcome: 'ok',
      preview: {
        zone: { id: 'zone-cali-norte', name: 'Norte', active: true },
        city: { id: 'city-cali', name: 'Cali' },
        country: { id: 'country-co', name: 'Colombia' },
        timeZone: 'America/Bogota',
        startsAt: '2026-09-21T14:00:00-05:00',
        quoteFrom: '2026-09-21T13:00:00-05:00',
        leadMinutes: 60,
        currency: 'COP',
        quotable: { ok: true },
        rate: { amount: 40000, origin: { scope: 'zone', refId: 'zone-cali-norte', name: 'Norte' }, tier: { modality: null, level: null } },
        surcharge: { amount: 5000, tier: { fromMinutes: 60, toMinutes: 120 } },
        commission: { amount: 7000, origin: { scope: 'country', refId: 'country-co', name: 'Colombia' }, tier: { modality: null, level: null } },
        vat: { rateBps: 1900, amount: 1330 },
        totalForGoalkeeper: 8330,
        rules: {
          bookingWindowDays: { value: 2, origin: 'country' },
          minNoticeMinutes: { value: 30, origin: 'country' },
          freeCancellationMinutes: { value: 60, origin: 'default' },
          travelBufferMinutes: { value: 30, origin: 'default' },
        },
      },
    });
  });

  it('uses the most specific tier and level, and the general rate for "any"', async () => {
    world.rentalRateRepository.seed(new RentalRate({ id: 'f11', scope: 'city', refId: 'city-cali', durationMinutes: 60, amount: 50000, modality: 'futbol_11' }));
    world.commissionSettingRepository.seed(new CommissionSetting({ id: 'c-sur', scope: 'zone', refId: 'zone-cali-sur', amount: 9000 }));
    const sur = await preview({ zoneId: 'zone-cali-sur' });
    const any = await preview({ zoneId: 'zone-cali-sur', modality: 'any' });
    expect(sur).toMatchObject({ preview: { rate: { amount: 45000, origin: { scope: 'zone' } }, commission: { amount: 9000, origin: { scope: 'zone', name: 'Sur' } } } });
    expect((await preview({ zoneId: 'zone-cali-centro' }))).toMatchObject({ preview: { rate: { amount: 50000, origin: { scope: 'city', name: 'Cali' }, tier: { modality: 'futbol_11', level: null } } } });
    expect(any).toMatchObject({ preview: { rate: { amount: 45000, tier: { modality: null } } } });
  });

  it('quotes from the chosen moment, read in the city time zone', async () => {
    const result = await preview({ startsAtLocal: '2026-09-21T14:00', quoteFromLocal: '2026-09-21T11:00' });
    expect(result).toMatchObject({ preview: { quoteFrom: '2026-09-21T11:00:00-05:00', leadMinutes: 180, surcharge: { amount: 0, tier: { fromMinutes: 120, toMinutes: null } }, quotable: { ok: true } } });
  });

  it('says why it cannot be quoted, and still shows what would apply', async () => {
    const result = await preview({ startsAtLocal: '2026-09-21T13:00' });
    expect(result).toMatchObject({
      preview: {
        quotable: { ok: false, outcome: 'insufficient_notice', target: { screen: 'bookingSettings', id: 'city-cali' } },
        rate: { amount: 40000 },
        commission: { amount: 7000 },
      },
    });
  });

  it('marks an inactive zone, and a duration with no rate', async () => {
    world.zoneRepository.seed(new Zone({ id: 'zone-off', cityId: 'city-cali', name: 'Apagada', slug: 'off', geometry: { type: 'Polygon', coordinates: [] }, active: false, displayOrder: 9 }));
    world.rentalRateRepository.clear();
    expect(await preview({ zoneId: 'zone-off' })).toMatchObject({ preview: { quotable: { ok: false, outcome: 'zone_inactive' }, zone: { active: false } } });
    expect(await preview()).toMatchObject({ preview: { rate: null, quotable: { ok: false, outcome: 'rate_not_configured', target: { screen: 'rentalRates', id: 'city-cali' } } } });
  });

  it('refuses a moment to quote from that comes after the start, and an unknown zone', async () => {
    expect(await preview({ quoteFromLocal: '2026-09-21T15:00' })).toEqual({ outcome: 'invalid', fieldErrors: { quoteFromLocal: 'after_start' } });
    expect(await preview({ zoneId: 'nope' })).toEqual({ outcome: 'not_found' });
  });
});

describe('GetPricingPreviewQuery — every reason a quote stops, with its screen', () => {
  it('points a start outside the window to the rules, and a past or off-slot start nowhere', async () => {
    expect(await preview({ startsAtLocal: '2026-09-25T15:00' })).toMatchObject({
      preview: { quotable: { ok: false, outcome: 'outside_booking_window', target: { screen: 'bookingSettings', id: 'city-cali' } } },
    });
    expect(await preview({ startsAtLocal: '2026-09-21T12:00' })).toMatchObject({ preview: { quotable: { ok: false, outcome: 'start_time_in_past', target: null }, leadMinutes: 0 } });
    expect(await preview({ startsAtLocal: '2026-09-21T14:15' })).toMatchObject({ preview: { quotable: { ok: false, outcome: 'invalid_start_time', target: null } } });
  });

  it('points a missing commission to the commissions, and missing rules to the rules', async () => {
    world.commissionSettingRepository.clear();
    expect(await preview()).toMatchObject({
      preview: { commission: null, vat: null, totalForGoalkeeper: null, quotable: { outcome: 'service_not_configured', target: { screen: 'commissions', id: 'city-cali' } } },
    });
    world.bookingSettingsRepository.clear();
    expect(await preview()).toMatchObject({ preview: { surcharge: null, quotable: { outcome: 'service_not_configured', target: { screen: 'bookingSettings', id: 'city-cali' } } } });
  });

  it('points a country without currency to the country', async () => {
    const { Country } = await import('../../../../../../src/domain/countries/country.js');
    world.countryRepository.seed(new Country({ id: 'country-co', name: 'Colombia', dialCode: '+57', countryCode: 'CO', currency: null }));
    expect(await preview()).toMatchObject({ preview: { currency: null, quotable: { outcome: 'service_not_configured', target: { screen: 'country', id: 'country-co' } } } });
  });

  it('charges no VAT where the country has none', async () => {
    const empty = new (await import('../../../../../fakes/fakeTaxSettingsRepository.js')).FakeTaxSettingsRepository();
    const result = await new GetPricingPreviewQueryHandler({ ...world, taxSettings: empty }).handle(
      new GetPricingPreviewQuery({ zoneId: 'zone-cali-norte', durationMinutes: 60, modality: 'any', level: 'recreational', startsAtLocal: '2026-09-21T14:00', quoteFromLocal: null }),
    );
    expect(result).toMatchObject({ preview: { vat: { rateBps: 0, amount: 0 }, totalForGoalkeeper: 7000 } });
  });

  it('refuses a zone whose city has no time zone, and a time that is not in it', async () => {
    const { City } = await import('../../../../../../src/domain/locations/city.js');
    world.cityRepository.seed(new City({ id: 'city-cali', name: 'Cali', regionId: 'region-valle', zoneCityId: null, timeZone: null }));
    expect(await preview()).toEqual({ outcome: 'time_zone_not_configured', cityId: 'city-cali' });
  });

  it('refuses a start the time zone skips', async () => {
    const { City } = await import('../../../../../../src/domain/locations/city.js');
    world.cityRepository.seed(new City({ id: 'city-cali', name: 'Cali', regionId: 'region-valle', zoneCityId: null, timeZone: 'America/New_York' }));
    expect(await preview({ startsAtLocal: '2026-03-08T02:30' })).toEqual({ outcome: 'invalid', fieldErrors: { startsAtLocal: 'nonexistent_local_time' } });
    expect(await preview({ startsAtLocal: '2026-03-09T02:30', quoteFromLocal: '2026-03-08T02:30' })).toEqual({ outcome: 'invalid', fieldErrors: { quoteFromLocal: 'nonexistent_local_time' } });
  });
});
