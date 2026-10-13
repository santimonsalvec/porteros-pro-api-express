import { describe, expect, it } from 'vitest';
import { GetDashboardAreasQuery } from '../../../../../src/application/features/dashboard/queries/getDashboardAreas/getDashboardAreasQuery.js';
import { GetDashboardAreasQueryHandler } from '../../../../../src/application/features/dashboard/queries/getDashboardAreas/getDashboardAreasQueryHandler.js';
import { Country } from '../../../../../src/domain/countries/country.js';
import { City } from '../../../../../src/domain/locations/city.js';
import { Region } from '../../../../../src/domain/locations/region.js';

const all = <T>(items: T[]) => async () => ({ items, totalItems: items.length });

describe('GetDashboardAreasQueryHandler (admin spec 008, the scope filter)', () => {
  it("lists every country with its code and every city with its region's country", async () => {
    const handler = new GetDashboardAreasQueryHandler({
      countries: { list: all([new Country({ id: 'co', name: 'Colombia', dialCode: '+57', countryCode: 'CO' }), new Country({ id: 'mx', name: 'México', dialCode: '+52', countryCode: 'MX' })]) },
      regions: { list: all([new Region({ id: 'ant', name: 'Antioquia', countryId: 'co' }), new Region({ id: 'orphan', name: 'Sin país', countryId: null })]) },
      cities: {
        list: all([
          new City({ id: 'medellin', name: 'Medellín', regionId: 'ant', zoneCityId: null }),
          new City({ id: 'envigado', name: 'Envigado', regionId: 'ant', zoneCityId: 'medellin' }),
          new City({ id: 'nowhere', name: 'Huérfana', regionId: 'orphan', zoneCityId: null }),
        ]),
      },
    });

    expect(await handler.handle(new GetDashboardAreasQuery())).toEqual({
      countries: [
        { id: 'co', name: 'Colombia', countryCode: 'CO' },
        { id: 'mx', name: 'México', countryCode: 'MX' },
      ],
      cities: [
        { id: 'envigado', name: 'Envigado', countryId: 'co' },
        { id: 'medellin', name: 'Medellín', countryId: 'co' },
      ],
    });
  });
});
