import { describe, expect, it } from 'vitest';
import type { DashboardGeographyCity, IDashboardGeography } from '../../../../../src/application/features/dashboard/common/ports.js';
import { resolveDashboardScope } from '../../../../../src/application/features/dashboard/common/scope.js';
import { PLATFORM_TIME_ZONE } from '../../../../../src/domain/common/platformTimeZone.js';

const cities: DashboardGeographyCity[] = [
  { id: 'medellin', countryId: 'co', timeZone: 'America/Bogota' },
  { id: 'bogota', countryId: 'co', timeZone: 'America/Bogota' },
  { id: 'cali', countryId: 'co', timeZone: null },
  { id: 'cdmx', countryId: 'mx', timeZone: 'America/Mexico_City' },
  { id: 'tijuana', countryId: 'mx', timeZone: 'America/Tijuana' },
  { id: 'quito', countryId: 'ec', timeZone: null },
];
const countries = new Set(['co', 'mx', 'ec', 'pe']);

const geography: IDashboardGeography = {
  countryExists: async (countryId) => countries.has(countryId),
  getCity: async (cityId) => cities.find((city) => city.id === cityId) ?? null,
  citiesOfCountry: async (countryId) => cities.filter((city) => city.countryId === countryId),
};

describe('resolveDashboardScope (admin spec 008, research §2)', () => {
  it('uses the platform zone and the whole platform without a filter', async () => {
    expect(PLATFORM_TIME_ZONE).toBe('America/Bogota');
    expect(await resolveDashboardScope(geography, {})).toEqual({
      outcome: 'ok',
      scope: { countryId: null, cityId: null, cityIds: null, timeZone: PLATFORM_TIME_ZONE, timeZoneSource: 'platform', timeZoneFallback: null },
    });
  });

  it("uses the zone every one of a country's zoned cities shares, and all its cities", async () => {
    expect(await resolveDashboardScope(geography, { countryId: 'co' })).toEqual({
      outcome: 'ok',
      scope: { countryId: 'co', cityId: null, cityIds: ['medellin', 'bogota', 'cali'], timeZone: 'America/Bogota', timeZoneSource: 'country', timeZoneFallback: null },
    });
  });

  it('falls back to the platform when the cities have different zones (mixed)', async () => {
    const result = await resolveDashboardScope(geography, { countryId: 'mx' });
    expect(result).toMatchObject({ outcome: 'ok', scope: { timeZone: PLATFORM_TIME_ZONE, timeZoneSource: 'platform', timeZoneFallback: 'mixed', cityIds: ['cdmx', 'tijuana'] } });
  });

  it('falls back to the platform when no city has a zone (missing), or the country has no cities', async () => {
    expect(await resolveDashboardScope(geography, { countryId: 'ec' })).toMatchObject({ outcome: 'ok', scope: { timeZoneSource: 'platform', timeZoneFallback: 'missing', cityIds: ['quito'] } });
    expect(await resolveDashboardScope(geography, { countryId: 'pe' })).toMatchObject({ outcome: 'ok', scope: { timeZoneSource: 'platform', timeZoneFallback: 'missing', cityIds: [] } });
  });

  it("uses a city's own zone and only that city", async () => {
    expect(await resolveDashboardScope(geography, { countryId: 'mx', cityId: 'tijuana' })).toEqual({
      outcome: 'ok',
      scope: { countryId: 'mx', cityId: 'tijuana', cityIds: ['tijuana'], timeZone: 'America/Tijuana', timeZoneSource: 'city', timeZoneFallback: null },
    });
  });

  it("uses the country's shared zone for a city without one, or the platform's", async () => {
    expect(await resolveDashboardScope(geography, { countryId: 'co', cityId: 'cali' })).toMatchObject({
      outcome: 'ok',
      scope: { cityIds: ['cali'], timeZone: 'America/Bogota', timeZoneSource: 'country', timeZoneFallback: null },
    });
    expect(await resolveDashboardScope(geography, { countryId: 'ec', cityId: 'quito' })).toMatchObject({
      outcome: 'ok',
      scope: { timeZone: PLATFORM_TIME_ZONE, timeZoneSource: 'platform', timeZoneFallback: 'missing' },
    });
  });

  it('rejects a city without its country, from another country, or that does not exist', async () => {
    expect(await resolveDashboardScope(geography, { cityId: 'medellin' })).toEqual({ outcome: 'invalid' });
    expect(await resolveDashboardScope(geography, { countryId: 'mx', cityId: 'medellin' })).toEqual({ outcome: 'city_not_in_country' });
    expect(await resolveDashboardScope(geography, { countryId: 'co', cityId: 'nope' })).toEqual({ outcome: 'city_not_found' });
    expect(await resolveDashboardScope(geography, { countryId: 'nope' })).toEqual({ outcome: 'country_not_found' });
  });
});
