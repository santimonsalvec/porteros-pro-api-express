import { describe, expect, it } from 'vitest';
import { SaveCountryCommand } from '../../../../../src/application/features/geography/commands/saveCountry/saveCountryCommand.js';
import { SaveCountryCommandHandler } from '../../../../../src/application/features/geography/commands/saveCountry/saveCountryCommandHandler.js';
import { SaveRegionCommand } from '../../../../../src/application/features/geography/commands/saveRegion/saveRegionCommand.js';
import { SaveRegionCommandHandler } from '../../../../../src/application/features/geography/commands/saveRegion/saveRegionCommandHandler.js';
import { DeleteRegionCommand } from '../../../../../src/application/features/geography/commands/deleteRegion/deleteRegionCommand.js';
import { DeleteRegionCommandHandler } from '../../../../../src/application/features/geography/commands/deleteRegion/deleteRegionCommandHandler.js';
import { ListCountriesQuery } from '../../../../../src/application/features/geography/queries/listCountries/listCountriesQuery.js';
import { ListCountriesQueryHandler } from '../../../../../src/application/features/geography/queries/listCountries/listCountriesQueryHandler.js';
import { GetCountryQuery } from '../../../../../src/application/features/geography/queries/getCountry/getCountryQuery.js';
import { GetCountryQueryHandler } from '../../../../../src/application/features/geography/queries/getCountry/getCountryQueryHandler.js';
import { ListRegionsQuery } from '../../../../../src/application/features/geography/queries/listRegions/listRegionsQuery.js';
import { ListRegionsQueryHandler } from '../../../../../src/application/features/geography/queries/listRegions/listRegionsQueryHandler.js';
import { GetRegionQuery } from '../../../../../src/application/features/geography/queries/getRegion/getRegionQuery.js';
import { GetRegionQueryHandler } from '../../../../../src/application/features/geography/queries/getRegion/getRegionQueryHandler.js';
import { geographyKit } from './geographyTestKit.js';

const ECUADOR = { name: 'Ecuador', countryCode: 'ec', dialCode: '+593', currency: 'USD' };

describe('SaveCountryCommandHandler', () => {
  it('creates a country with its code in capitals', async () => {
    const kit = geographyKit();
    expect(await new SaveCountryCommandHandler(kit).handle(SaveCountryCommand.create(ECUADOR))).toEqual({ outcome: 'saved', countryId: 'new-1', created: true });
    expect(kit.countries.items.get('new-1')).toMatchObject({ countryCode: 'EC', currency: 'USD', revision: 0 });
  });

  it('refuses a code another country has', async () => {
    const kit = geographyKit();
    expect(await new SaveCountryCommandHandler(kit).handle(SaveCountryCommand.create({ ...ECUADOR, countryCode: 'co' }))).toEqual({ outcome: 'country_code_taken' });
  });

  it('warns before changing the code (the secrets are named after it)', async () => {
    const kit = geographyKit();
    const handler = new SaveCountryCommandHandler(kit);

    expect(await handler.handle(SaveCountryCommand.edit('co', 0, { countryCode: 'CL' }))).toMatchObject({
      outcome: 'warnings',
      warnings: [{ code: 'country_code_changes_secrets', data: { from: 'CO', to: 'CL' } }],
    });
    expect(await handler.handle(SaveCountryCommand.edit('co', 0, { countryCode: 'CL' }, true))).toMatchObject({ outcome: 'saved' });
  });

  it('locks the currency of a country that operates, also against removing it', async () => {
    const kit = geographyKit();
    const handler = new SaveCountryCommandHandler(kit);
    kit.usage.operatingCountries.add('co');

    expect(await handler.handle(SaveCountryCommand.edit('co', 0, { currency: 'USD' }))).toEqual({ outcome: 'currency_locked' });
    expect(await handler.handle(SaveCountryCommand.edit('co', 0, { currency: null }))).toEqual({ outcome: 'currency_locked' });
    expect(await handler.handle(SaveCountryCommand.edit('co', 0, { name: 'República de Colombia', currency: 'COP' }))).toMatchObject({ outcome: 'saved' });
  });

  it('lets a country that does not operate correct its currency', async () => {
    const kit = geographyKit();
    expect(await new SaveCountryCommandHandler(kit).handle(SaveCountryCommand.edit('co', 0, { currency: 'USD' }))).toMatchObject({ outcome: 'saved' });
  });

  it('reports stale and missing countries', async () => {
    const kit = geographyKit();
    const handler = new SaveCountryCommandHandler(kit);
    expect(await handler.handle(SaveCountryCommand.edit('co', 4, { name: 'Colombia' }))).toEqual({ outcome: 'stale' });
    expect(await handler.handle(SaveCountryCommand.edit('pe', 0, { name: 'Perú' }))).toEqual({ outcome: 'not_found' });
  });
});

describe('SaveRegionCommandHandler', () => {
  it('creates and edits a region of an existing country', async () => {
    const kit = geographyKit();
    const handler = new SaveRegionCommandHandler(kit);

    expect(await handler.handle(SaveRegionCommand.create({ name: 'Caldas', countryId: 'co' }))).toEqual({ outcome: 'saved', regionId: 'new-1', created: true });
    expect(await handler.handle(SaveRegionCommand.edit('new-1', 0, { name: 'Caldas (Eje)' }))).toMatchObject({ outcome: 'saved' });
    expect(kit.regions.items.get('new-1')).toMatchObject({ name: 'Caldas (Eje)', countryId: 'co', revision: 1 });
  });

  it('needs an existing country', async () => {
    const kit = geographyKit();
    expect(await new SaveRegionCommandHandler(kit).handle(SaveRegionCommand.create({ name: 'Caldas', countryId: 'pe' }))).toEqual({
      outcome: 'invalid',
      fieldErrors: { countryId: 'Country not found.' },
    });
  });
});

describe('deleting regions', () => {
  it('keeps a region with cities and deletes one without', async () => {
    const kit = geographyKit();
    kit.usage.use('ant', 'region_has_cities');

    expect(await new DeleteRegionCommandHandler(kit).handle(new DeleteRegionCommand('ant'))).toEqual({ outcome: 'in_use', reason: 'region_has_cities' });
    kit.usage.reasons.clear();
    expect(await new DeleteRegionCommandHandler(kit).handle(new DeleteRegionCommand('ant'))).toEqual({ outcome: 'deleted' });
  });
});

describe('country and region views', () => {
  it('lists countries with their regions and whether they operate', async () => {
    const kit = geographyKit();
    kit.usage.operatingCountries.add('co');

    const page = await new ListCountriesQueryHandler(kit).handle(new ListCountriesQuery({}, 1, 20));

    expect(page).toMatchObject({ totalItems: 1, items: [{ id: 'co', name: 'Colombia', countryCode: 'CO', dialCode: '+57', currency: 'COP', regionCount: 1, operating: true, revision: 0 }] });
    expect(await new GetCountryQueryHandler(kit).handle(new GetCountryQuery('pe'))).toEqual({ outcome: 'not_found' });
  });

  it('lists regions with their country and cities', async () => {
    const kit = geographyKit();

    const page = await new ListRegionsQueryHandler(kit).handle(new ListRegionsQuery({ countryId: 'co' }, 1, 20));

    expect(page.items).toEqual([{ id: 'ant', name: 'Antioquia', countryId: 'co', countryName: 'Colombia', cityCount: 3, revision: 0 }]);
    expect(await new GetRegionQueryHandler(kit).handle(new GetRegionQuery('ant'))).toMatchObject({ outcome: 'ok', region: { id: 'ant' } });
  });
});
