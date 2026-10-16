import { describe, expect, it } from 'vitest';
import type { DashboardGeographyMarket, IDashboardGeography } from '../../../../../src/application/features/dashboard/common/ports.js';
import { resolveDashboardScope } from '../../../../../src/application/features/dashboard/common/scope.js';
import { PLATFORM_TIME_ZONE } from '../../../../../src/domain/common/platformTimeZone.js';

const cities: DashboardGeographyMarket[] = [
  { id: 'medellin', countryId: 'co', timeZone: 'America/Bogota' },
  { id: 'bogota', countryId: 'co', timeZone: 'America/Bogota' },
  { id: 'cali', countryId: 'co', timeZone: 'America/Bogota' },
  { id: 'cdmx', countryId: 'mx', timeZone: 'America/Mexico_City' },
  { id: 'tijuana', countryId: 'mx', timeZone: 'America/Tijuana' },
  { id: 'quito', countryId: 'ec', timeZone: 'America/Guayaquil' },
];
const countries = new Set(['co', 'mx', 'ec', 'pe']);

const geography: IDashboardGeography = {
  countryExists: async (countryId) => countries.has(countryId),
  getMarket: async (marketId) => cities.find((city) => city.id === marketId) ?? null,
  marketsOfCountry: async (countryId) => cities.filter((city) => city.countryId === countryId),
};

describe('resolveDashboardScope (admin spec 008, research §2)', () => {
  it('uses the platform zone and the whole platform without a filter', async () => {
    expect(PLATFORM_TIME_ZONE).toBe('America/Bogota');
    expect(await resolveDashboardScope(geography, {})).toEqual({
      outcome: 'ok',
      scope: { countryId: null, marketId: null, marketIds: null, timeZone: PLATFORM_TIME_ZONE, timeZoneSource: 'platform', timeZoneFallback: null },
    });
  });

  it("uses the zone every one of a country's zoned cities shares, and all its cities", async () => {
    expect(await resolveDashboardScope(geography, { countryId: 'co' })).toEqual({
      outcome: 'ok',
      scope: { countryId: 'co', marketId: null, marketIds: ['medellin', 'bogota', 'cali'], timeZone: 'America/Bogota', timeZoneSource: 'country', timeZoneFallback: null },
    });
  });

  it('falls back to the platform when the cities have different zones (mixed)', async () => {
    const result = await resolveDashboardScope(geography, { countryId: 'mx' });
    expect(result).toMatchObject({ outcome: 'ok', scope: { timeZone: PLATFORM_TIME_ZONE, timeZoneSource: 'platform', timeZoneFallback: 'mixed', marketIds: ['cdmx', 'tijuana'] } });
  });

  it('uses the zone of a country with one market, and falls back to the platform when the country has no markets', async () => {
    expect(await resolveDashboardScope(geography, { countryId: 'ec' })).toMatchObject({ outcome: 'ok', scope: { timeZone: 'America/Guayaquil', timeZoneSource: 'country', marketIds: ['quito'] } });
    expect(await resolveDashboardScope(geography, { countryId: 'pe' })).toMatchObject({ outcome: 'ok', scope: { timeZoneSource: 'platform', timeZoneFallback: 'missing', marketIds: [] } });
  });

  it("uses a city's own zone and only that city", async () => {
    expect(await resolveDashboardScope(geography, { countryId: 'mx', marketId: 'tijuana' })).toEqual({
      outcome: 'ok',
      scope: { countryId: 'mx', marketId: 'tijuana', marketIds: ['tijuana'], timeZone: 'America/Tijuana', timeZoneSource: 'market', timeZoneFallback: null },
    });
  });

  it('every market has its own zone (spec 031)', async () => {
    expect(await resolveDashboardScope(geography, { countryId: 'co', marketId: 'cali' })).toMatchObject({
      outcome: 'ok',
      scope: { marketIds: ['cali'], timeZone: 'America/Bogota', timeZoneSource: 'market', timeZoneFallback: null },
    });
  });

  it('rejects a market without its country, from another country, or that does not exist', async () => {
    expect(await resolveDashboardScope(geography, { marketId: 'medellin' })).toEqual({ outcome: 'invalid' });
    expect(await resolveDashboardScope(geography, { countryId: 'mx', marketId: 'medellin' })).toEqual({ outcome: 'market_not_in_country' });
    expect(await resolveDashboardScope(geography, { countryId: 'co', marketId: 'nope' })).toEqual({ outcome: 'market_not_found' });
    expect(await resolveDashboardScope(geography, { countryId: 'nope' })).toEqual({ outcome: 'country_not_found' });
  });
});
