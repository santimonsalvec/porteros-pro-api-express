import { beforeEach, describe, expect, it } from 'vitest';
import { City } from '../../../../../../src/domain/locations/city.js';
import { Country } from '../../../../../../src/domain/countries/country.js';
import { Region } from '../../../../../../src/domain/locations/region.js';
import { RentalRate } from '../../../../../../src/domain/pricing/rentalRate.js';
import { CreateRentalRateCommand } from '../../../../../../src/application/features/pricing/commands/createRentalRate/createRentalRateCommand.js';
import { CreateRentalRateCommandHandler } from '../../../../../../src/application/features/pricing/commands/createRentalRate/createRentalRateCommandHandler.js';
import { UpdateRentalRateCommand } from '../../../../../../src/application/features/pricing/commands/updateRentalRate/updateRentalRateCommand.js';
import { UpdateRentalRateCommandHandler } from '../../../../../../src/application/features/pricing/commands/updateRentalRate/updateRentalRateCommandHandler.js';
import { DeleteRentalRateCommand } from '../../../../../../src/application/features/pricing/commands/deleteRentalRate/deleteRentalRateCommand.js';
import { DeleteRentalRateCommandHandler } from '../../../../../../src/application/features/pricing/commands/deleteRentalRate/deleteRentalRateCommandHandler.js';
import { ListRentalRatesQuery } from '../../../../../../src/application/features/pricing/queries/listRentalRates/listRentalRatesQuery.js';
import { ListRentalRatesQueryHandler } from '../../../../../../src/application/features/pricing/queries/listRentalRates/listRentalRatesQueryHandler.js';
import { GetRentalRateQuery } from '../../../../../../src/application/features/pricing/queries/getRentalRate/getRentalRateQuery.js';
import { GetRentalRateQueryHandler } from '../../../../../../src/application/features/pricing/queries/getRentalRate/getRentalRateQueryHandler.js';
import { GetRentalRateDeleteImpactQuery } from '../../../../../../src/application/features/pricing/queries/getRentalRateDeleteImpact/getRentalRateDeleteImpactQuery.js';
import { GetRentalRateDeleteImpactQueryHandler } from '../../../../../../src/application/features/pricing/queries/getRentalRateDeleteImpact/getRentalRateDeleteImpactQueryHandler.js';
import { pricingKit } from '../pricingTestKit.js';

let kit: ReturnType<typeof pricingKit>;
const general = { modality: null, level: null };
const rate = (id: string, scope: 'city' | 'zone', refId: string, durationMinutes: number, amount: number, tier: { modality: string | null; level: string | null } = general) =>
  kit.rentalRates.base.seed(new RentalRate({ id, scope, refId, durationMinutes, amount, ...tier }));

beforeEach(() => {
  kit = pricingKit();
});

describe('CreateRentalRateCommand', () => {
  const create = (input: Partial<CreateRentalRateCommand['input']> = {}) =>
    new CreateRentalRateCommandHandler(kit).handle(
      new CreateRentalRateCommand({ scope: 'city', refId: 'med', durationMinutes: 90, modality: null, level: null, amount: 55000, ...input }),
    );

  it('creates a city rate and a zone rate', async () => {
    expect(await create()).toEqual({ outcome: 'saved', rateId: 'new-1' });
    expect(await create({ scope: 'zone', refId: 'bello', amount: 60000 })).toEqual({ outcome: 'saved', rateId: 'new-2' });
    expect((await kit.rentalRates.base.findForDuration('bello', 'med', 90)).zone[0]?.amount).toBe(60000);
  });

  it('refuses a level without a modality and an amount above the limit, on their fields', async () => {
    expect(await create({ level: 'competitive', amount: 100_000_001 })).toEqual({
      outcome: 'invalid',
      fieldErrors: { level: 'level_requires_modality', amount: 'above_limit' },
    });
  });

  it('refuses a city that uses the zones of another', async () => {
    expect(await create({ refId: 'env' })).toEqual({ outcome: 'city_not_anchor', anchorCityId: 'med' });
  });

  it('refuses an unknown city or zone', async () => {
    expect(await create({ refId: 'nowhere' })).toEqual({ outcome: 'city_not_found' });
    expect(await create({ scope: 'zone', refId: 'nowhere' })).toEqual({ outcome: 'zone_not_found' });
  });

  it('refuses a city whose country has no currency', async () => {
    kit.countries.items.set('ve', new Country({ id: 've', name: 'Venezuela', dialCode: '+58', countryCode: 'VE', currency: null }));
    kit.regions.items.set('zul', new Region({ id: 'zul', name: 'Zulia', countryId: 've' }));
    kit.cities.items.set('mar', new City({ id: 'mar', name: 'Maracaibo', regionId: 'zul', zoneCityId: null }));
    expect(await create({ refId: 'mar' })).toEqual({ outcome: 'country_without_currency' });
  });

  it('answers duplicate with the existing rate', async () => {
    rate('r-city', 'city', 'med', 90, 50000);
    expect(await create()).toEqual({ outcome: 'duplicate', existingId: 'r-city' });
  });
});

describe('UpdateRentalRateCommand', () => {
  const update = (revision: number, amount: number, id = 'r-city') =>
    new UpdateRentalRateCommandHandler(kit).handle(new UpdateRentalRateCommand(id, revision, amount));

  beforeEach(() => rate('r-city', 'city', 'med', 90, 50000));

  it('changes only the amount', async () => {
    expect(await update(0, 55000)).toEqual({ outcome: 'saved', rateId: 'r-city' });
    expect(await kit.rentalRates.getById('r-city')).toMatchObject({ amount: 55000, revision: 1, durationMinutes: 90 });
  });

  it('is stale at an old revision, and not found for an unknown id', async () => {
    expect(await update(3, 55000)).toEqual({ outcome: 'stale' });
    expect(await update(0, 55000, 'nope')).toEqual({ outcome: 'not_found' });
  });

  it('refuses an amount above the limit', async () => {
    expect(await update(0, 100_000_001)).toEqual({ outcome: 'invalid', fieldErrors: { amount: 'above_limit' } });
  });
});

describe('DeleteRentalRateCommand', () => {
  it('deletes, and is not found the second time', async () => {
    rate('r-city', 'city', 'med', 90, 50000);
    const handler = new DeleteRentalRateCommandHandler(kit);
    expect(await handler.handle(new DeleteRentalRateCommand('r-city'))).toEqual({ outcome: 'deleted' });
    expect(await handler.handle(new DeleteRentalRateCommand('r-city'))).toEqual({ outcome: 'not_found' });
  });
});

describe('ListRentalRatesQuery', () => {
  const list = (filters: ListRentalRatesQuery['filters'] = {}, page = 1, pageSize = 20) =>
    new ListRentalRatesQueryHandler(kit).handle(new ListRentalRatesQuery(filters, page, pageSize));

  beforeEach(() => {
    rate('r-poblado-90', 'zone', 'poblado', 90, 62000);
    rate('r-bello-90', 'zone', 'bello', 90, 60000);
    rate('r-f11-90', 'city', 'med', 90, 70000, { modality: 'futbol_11', level: 'competitive' });
    rate('r-city-90', 'city', 'med', 90, 55000);
    rate('r-city-60', 'city', 'med', 60, 40000);
    rate('r-f11-only-90', 'city', 'med', 90, 65000, { modality: 'futbol_11', level: null });
  });

  it("lists a city's rates by duration, city before zones (by display order), general before tiers", async () => {
    const result = await list({ cityId: 'med' });
    expect(result.items.map((item) => item.id)).toEqual(['r-city-60', 'r-city-90', 'r-f11-only-90', 'r-f11-90', 'r-bello-90', 'r-poblado-90']);
    expect(result).toMatchObject({ page: 1, pageSize: 20, totalItems: 6, totalPages: 1 });
    expect(result.items[4]).toMatchObject({ zoneName: 'Bello', zoneActive: true, cityName: 'Medellín', currency: 'COP', targetValid: true });
  });

  it('filters by duration, modality, zone and country', async () => {
    expect((await list({ cityId: 'med', durationMinutes: 60 })).items.map((item) => item.id)).toEqual(['r-city-60']);
    expect((await list({ modality: 'general', durationMinutes: 90 })).items.map((item) => item.id)).toEqual(['r-city-90', 'r-bello-90', 'r-poblado-90']);
    expect((await list({ zoneId: 'bello' })).items.map((item) => item.id)).toEqual(['r-bello-90']);
    expect((await list({ countryId: 'co' })).totalItems).toBe(6);
    expect((await list({ countryId: 'pe' })).totalItems).toBe(0);
  });

  it('pages the sorted list', async () => {
    const second = await list({ cityId: 'med' }, 2, 4);
    expect(second.items.map((item) => item.id)).toEqual(['r-bello-90', 'r-poblado-90']);
    expect(second).toMatchObject({ totalItems: 6, totalPages: 2 });
  });

  it('marks a rate whose target is gone', async () => {
    rate('r-ghost', 'zone', 'deleted-zone', 60, 1000);
    const result = await list({});
    expect(result.items.find((item) => item.id === 'r-ghost')).toMatchObject({ targetValid: false, currency: null });
  });
});

describe('GetRentalRateQuery', () => {
  it('reads one rate with its target, or not found', async () => {
    rate('r-bello-90', 'zone', 'bello', 90, 60000);
    const handler = new GetRentalRateQueryHandler(kit);
    expect(await handler.handle(new GetRentalRateQuery('r-bello-90'))).toMatchObject({
      outcome: 'ok',
      rate: { id: 'r-bello-90', zoneName: 'Bello', cityName: 'Medellín', currency: 'COP' },
    });
    expect(await handler.handle(new GetRentalRateQuery('nope'))).toEqual({ outcome: 'not_found' });
  });
});

describe('GetRentalRateDeleteImpactQuery', () => {
  const impact = (id: string) => new GetRentalRateDeleteImpactQueryHandler(kit).handle(new GetRentalRateDeleteImpactQuery(id));

  it("names the active zones that stop quoting the duration when the city's only rate goes", async () => {
    rate('r-city-90', 'city', 'med', 90, 55000);
    rate('r-bello-90', 'zone', 'bello', 90, 60000);
    expect(await impact('r-city-90')).toEqual({ outcome: 'ok', impact: { zoneCount: 2, zoneNames: ['Laureles', 'El Poblado'] } });
  });

  it('loses nothing when the city still covers the zone', async () => {
    rate('r-city-90', 'city', 'med', 90, 55000);
    rate('r-bello-90', 'zone', 'bello', 90, 60000);
    expect(await impact('r-bello-90')).toEqual({ outcome: 'ok', impact: { zoneCount: 0, zoneNames: [] } });
  });

  it('is not found for an unknown rate', async () => {
    expect(await impact('nope')).toEqual({ outcome: 'not_found' });
  });
});
