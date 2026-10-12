import { describe, expect, it } from 'vitest';
import { City } from '../../../src/domain/locations/city.js';
import { Country } from '../../../src/domain/countries/country.js';
import { Region } from '../../../src/domain/locations/region.js';
import { buildTestApp } from '../testAppFactory.js';
import { pricingStaff } from '../pricingTestHelpers.js';

const CITY_RULES = { revision: null, bookingWindowDays: null, minNoticeMinutes: null, freeCancellationMinutes: null, travelBufferMinutes: 45, leadTimeSurcharge: null };
const COUNTRY_RULES = {
  revision: null,
  bookingWindowDays: 7,
  minNoticeMinutes: 60,
  freeCancellationMinutes: 60,
  travelBufferMinutes: 30,
  leadTimeSurcharge: null,
  goalkeeperPenalties: null,
  checkInWindow: null,
  noShowGraceMinutes: null,
};

async function world() {
  const context = await buildTestApp();
  const { editor } = await pricingStaff(context);
  context.cityRepository.seed(new City({ id: 'city-jamundi', name: 'Jamundí', regionId: 'region-valle', zoneCityId: 'city-cali' }));
  context.quoteCountryRepository.seed(new Country({ id: 'country-ve', name: 'Venezuela', dialCode: '+58', countryCode: 'VE', currency: null }));
  context.regionRepository.seed(new Region({ id: 'region-zulia', name: 'Zulia', countryId: 'country-ve' }));
  context.cityRepository.seed(new City({ id: 'city-maracaibo', name: 'Maracaibo', regionId: 'region-zulia', zoneCityId: null, timeZone: null }));
  return { context, editor };
}

describe('admin pricing routes — every refusal answers its code (admin spec 004)', () => {
  it('rental rates', async () => {
    const { editor } = await world();
    const rate = (await editor.get('/admin/rental-rates?cityId=city-cali&durationMinutes=60')).body.items[0];

    const noCurrency = await editor.post('/admin/rental-rates', { scope: 'city', refId: 'city-maracaibo', durationMinutes: 60, amount: 1 });
    const aboveLimit = await editor.patch(`/admin/rental-rates/${rate.id}`, { revision: 0, amount: 100_000_001 });
    const unknownImpact = await editor.get('/admin/rental-rates/nope/delete-impact');
    const unknownDelete = await editor.post('/admin/rental-rates/nope/delete', { reason: 'Prueba' });

    expect([noCurrency.status, noCurrency.body.error]).toEqual([409, 'country_without_currency']);
    expect([aboveLimit.status, aboveLimit.body.fieldErrors]).toEqual([400, { amount: 'above_limit' }]);
    expect([unknownImpact.status, unknownImpact.body.error]).toEqual([404, 'rate_not_found']);
    expect([unknownDelete.status, unknownDelete.body.error]).toEqual([404, 'rate_not_found']);
  });

  it('commissions', async () => {
    const { editor } = await world();

    const noZone = await editor.post('/admin/commissions', { scope: 'zone', refId: 'nope', amount: 1 });
    const satellite = await editor.post('/admin/commissions', { scope: 'city', refId: 'city-jamundi', amount: 1 });
    const aboveLimit = await editor.patch('/admin/commissions/commission-country-co', { revision: 0, amount: 100_000_001 });
    const unknownPatch = await editor.patch('/admin/commissions/nope', { revision: 0, amount: 1 });
    const unknownImpact = await editor.get('/admin/commissions/nope/delete-impact');
    const unknownDelete = await editor.post('/admin/commissions/nope/delete', { reason: 'Prueba' });

    expect([noZone.status, noZone.body.error]).toEqual([404, 'zone_not_found']);
    expect([satellite.status, satellite.body.error, satellite.body.anchorCityId]).toEqual([409, 'city_not_anchor', 'city-cali']);
    expect([aboveLimit.status, aboveLimit.body.fieldErrors]).toEqual([400, { amount: 'above_limit' }]);
    expect([unknownPatch.status, unknownPatch.body.error]).toEqual([404, 'commission_not_found']);
    expect([unknownImpact.status, unknownImpact.body.error]).toEqual([404, 'commission_not_found']);
    expect([unknownDelete.status, unknownDelete.body.error]).toEqual([404, 'commission_not_found']);
  });

  it('booking rules', async () => {
    const { editor } = await world();

    const unknownCountry = await editor.put('/admin/booking-settings/countries/nope', COUNTRY_RULES);
    const unknownCity = await editor.get('/admin/booking-settings/cities/nope');
    const unknownCityWrite = await editor.put('/admin/booking-settings/cities/nope', CITY_RULES);
    const satelliteWrite = await editor.put('/admin/booking-settings/cities/city-jamundi', CITY_RULES);
    const badCity = await editor.put('/admin/booking-settings/cities/city-cali', { ...CITY_RULES, bookingWindowDays: 0 });
    const staleCity = await editor.put('/admin/booking-settings/cities/city-cali', { ...CITY_RULES, minNoticeMinutes: 60, travelBufferMinutes: null, revision: 4 });

    expect([unknownCountry.status, unknownCountry.body.error]).toEqual([404, 'country_not_found']);
    expect([unknownCity.status, unknownCity.body.error]).toEqual([404, 'city_not_found']);
    expect([unknownCityWrite.status, unknownCityWrite.body.error]).toEqual([404, 'city_not_found']);
    expect([satelliteWrite.status, satelliteWrite.body.error]).toEqual([409, 'city_not_anchor']);
    expect([badCity.status, badCity.body.fieldErrors]).toEqual([400, { bookingWindowDays: 'out_of_range' }]);
    expect([staleCity.status, staleCity.body.error]).toEqual([409, 'stale_revision']);
  });

  it('the simulator in a city without a time zone', async () => {
    const { context, editor } = await world();
    context.cityRepository.seed(new City({ id: 'city-cali', name: 'Cali', regionId: 'region-valle', zoneCityId: null, timeZone: null }));

    const response = await editor.get('/admin/pricing/preview?zoneId=zone-cali-norte&durationMinutes=60&modality=any&level=recreational&startsAtLocal=2026-09-21T14:00');

    expect([response.status, response.body.error]).toEqual([409, 'time_zone_not_configured']);
  });
});
