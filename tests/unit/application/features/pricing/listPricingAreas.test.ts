import { describe, expect, it } from 'vitest';
import { ListPricingAreasQuery } from '../../../../../src/application/features/pricing/queries/listPricingAreas/listPricingAreasQuery.js';
import { ListPricingAreasQueryHandler } from '../../../../../src/application/features/pricing/queries/listPricingAreas/listPricingAreasQueryHandler.js';
import { pricingKit } from './pricingTestKit.js';

describe('ListPricingAreasQuery (the admin pickers, spec 004)', () => {
  it('lists the countries and the markets, each with its zones in display order', async () => {
    const kit = pricingKit();
    expect(await new ListPricingAreasQueryHandler(kit).handle(new ListPricingAreasQuery())).toEqual({
      countries: [{ id: 'co', name: 'Colombia', currency: 'COP' }],
      markets: [
        {
          id: 'med',
          name: 'Medellín',
          countryId: 'co',
          zones: [
            { id: 'z-laureles', name: 'Laureles', active: true },
            { id: 'bello', name: 'Bello', active: true },
            { id: 'poblado', name: 'El Poblado', active: true },
            { id: 'robledo', name: 'Robledo', active: false },
          ],
        },
      ],
    });
  });
});
