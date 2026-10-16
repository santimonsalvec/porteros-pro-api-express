import { describe, expect, it } from 'vitest';
import { testMarket } from '../../../../fakes/fakeMarketRepository.js';
import { GetDashboardAreasQuery } from '../../../../../src/application/features/dashboard/queries/getDashboardAreas/getDashboardAreasQuery.js';
import { GetDashboardAreasQueryHandler } from '../../../../../src/application/features/dashboard/queries/getDashboardAreas/getDashboardAreasQueryHandler.js';
import { Country } from '../../../../../src/domain/countries/country.js';

const all = <T>(items: T[]) => async () => ({ items, totalItems: items.length });

describe('GetDashboardAreasQueryHandler (admin spec 008, the scope filter)', () => {
  it('lists every country with its code and every market with its country (spec 031)', async () => {
    const handler = new GetDashboardAreasQueryHandler({
      countries: { list: all([new Country({ id: 'co', name: 'Colombia', dialCode: '+57', countryCode: 'CO' }), new Country({ id: 'mx', name: 'México', dialCode: '+52', countryCode: 'MX' })]) },
      markets: { list: async () => [testMarket({ id: 'medellin', name: 'Medellín', countryId: 'co' }), testMarket({ id: 'bogota', name: 'Bogotá', countryId: 'co' })] },
    });

    expect(await handler.handle(new GetDashboardAreasQuery())).toEqual({
      countries: [
        { id: 'co', name: 'Colombia', countryCode: 'CO' },
        { id: 'mx', name: 'México', countryCode: 'MX' },
      ],
      markets: [
        { id: 'bogota', name: 'Bogotá', countryId: 'co' },
        { id: 'medellin', name: 'Medellín', countryId: 'co' },
      ],
    });
  });
});
