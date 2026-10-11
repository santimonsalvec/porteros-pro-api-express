import { describe, expect, it } from 'vitest';
import { City } from '../../../../../src/domain/locations/city.js';
import { Region } from '../../../../../src/domain/locations/region.js';
import { ListCitiesQuery } from '../../../../../src/application/features/geography/queries/listCities/listCitiesQuery.js';
import { ListCitiesQueryHandler } from '../../../../../src/application/features/geography/queries/listCities/listCitiesQueryHandler.js';
import { GetCityQuery } from '../../../../../src/application/features/geography/queries/getCity/getCityQuery.js';
import { GetCityQueryHandler } from '../../../../../src/application/features/geography/queries/getCity/getCityQueryHandler.js';
import { geographyKit } from './geographyTestKit.js';

function setup() {
  const kit = geographyKit();
  return {
    kit,
    list: (filters: ListCitiesQuery['filters'] = {}, page = 1, pageSize = 20) =>
      new ListCitiesQueryHandler(kit).handle(new ListCitiesQuery(filters, page, pageSize)),
    get: (cityId: string) => new GetCityQueryHandler(kit).handle(new GetCityQuery(cityId)),
  };
}

describe('ListCitiesQueryHandler', () => {
  it('shows each city with its region, country, anchor, zones, satellites, state and readiness', async () => {
    const { kit, list } = setup();
    kit.readiness.summaries.set('env', { ready: false, missingCount: 2 });

    const page = await list();

    expect(page).toMatchObject({ page: 1, pageSize: 20, totalItems: 3, totalPages: 1 });
    expect(page.items.map((city) => city.name)).toEqual(['Envigado', 'Itagüí', 'Medellín']);
    expect(page.items[2]).toEqual({
      id: 'med',
      name: 'Medellín',
      region: { id: 'ant', name: 'Antioquia' },
      country: { id: 'co', name: 'Colombia', countryCode: 'CO' },
      timeZone: 'America/Bogota',
      timeZoneValid: true,
      daneStateCode: '05',
      daneCityCode: '05001',
      zoneCity: null,
      zoneCount: 1,
      satelliteCount: 1,
      state: 'operating',
      readiness: { ready: true, missingCount: 0 },
      revision: 2,
    });
    expect(page.items[0]).toMatchObject({ zoneCity: { id: 'med', name: 'Medellín' }, state: 'operating', readiness: { ready: false, missingCount: 2 } });
    expect(page.items[1]).toMatchObject({ state: 'available', readiness: null, timeZone: null, timeZoneValid: true });
  });

  it('filters by state, anchor and name', async () => {
    const { list } = setup();
    expect((await list({ state: 'available' })).items.map((c) => c.id)).toEqual(['ita']);
    expect((await list({ state: 'operating', anchor: true })).items.map((c) => c.id)).toEqual(['med']);
    expect((await list({ q: 'env' })).items.map((c) => c.id)).toEqual(['env']);
  });

  it('filters by country through its regions, and by region', async () => {
    const { kit, list } = setup();
    kit.regions.items.set('pic', new Region({ id: 'pic', name: 'Pichincha', countryId: 'ec' }));
    kit.cities.items.set('uio', new City({ id: 'uio', name: 'Quito', regionId: 'pic', zoneCityId: null }));

    expect((await list({ countryId: 'ec' })).items.map((c) => c.id)).toEqual(['uio']);
    expect((await list({ regionId: 'ant' })).totalItems).toBe(3);
    expect((await list({ countryId: 'pe' })).items).toEqual([]);
  });

  it('marks an alias time zone and a region without country', async () => {
    const { kit, list } = setup();
    kit.regions.items.set('x', new Region({ id: 'x', name: 'Sin país' }));
    kit.cities.items.set('odd', new City({ id: 'odd', name: 'Odd', regionId: 'x', zoneCityId: null, timeZone: 'US/Eastern' }));

    const odd = (await list({ q: 'odd' })).items[0]!;
    expect(odd).toMatchObject({ country: null, timeZoneValid: false });
  });
});

describe('GetCityQueryHandler', () => {
  it('returns the city as the list shows it, or not found', async () => {
    const { get } = setup();
    expect(await get('env')).toMatchObject({ outcome: 'ok', city: { id: 'env', zoneCity: { id: 'med', name: 'Medellín' } } });
    expect(await get('nope')).toEqual({ outcome: 'not_found' });
  });
});

describe('city views without readiness (pickers, the detail and the audit)', () => {
  it('a list asked without readiness leaves it out and computes none', async () => {
    const { kit, list } = setup();
    let asked = 0;
    const summarize = kit.readiness.summarize.bind(kit.readiness);
    kit.readiness.summarize = async (cities) => {
      asked += 1;
      return summarize(cities);
    };

    const page = await new ListCitiesQueryHandler(kit).handle(new ListCitiesQuery({ state: 'operating' }, 1, 20, false));

    expect(page.items.every((city) => city.readiness === null)).toBe(true);
    expect(asked).toBe(0);
    expect((await list({ state: 'operating' })).items.some((city) => city.readiness !== null)).toBe(true);
  });

  it('the detail never computes it: the city page asks /admin/readiness', async () => {
    const { get } = setup();
    expect(await get('med')).toMatchObject({ outcome: 'ok', city: { readiness: null } });
  });
});

