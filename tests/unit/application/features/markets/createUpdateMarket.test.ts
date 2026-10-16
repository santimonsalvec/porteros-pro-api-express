import { beforeEach, describe, expect, it } from 'vitest';
import { CreateMarketCommand } from '../../../../../src/application/features/markets/commands/createMarket/createMarketCommand.js';
import { CreateMarketCommandHandler } from '../../../../../src/application/features/markets/commands/createMarket/createMarketCommandHandler.js';
import { UpdateMarketCommand } from '../../../../../src/application/features/markets/commands/updateMarket/updateMarketCommand.js';
import { UpdateMarketCommandHandler } from '../../../../../src/application/features/markets/commands/updateMarket/updateMarketCommandHandler.js';
import { Country } from '../../../../../src/domain/countries/country.js';
import { FixedClock } from '../../../../fakes/fakeClock.js';
import { FakeCountryRepository } from '../../../../fakes/fakeCountryRepository.js';
import { FakeMarketRepository } from '../../../../fakes/fakeMarketRepository.js';

const MEDELLIN = { name: 'Medellín', countryId: 'co', timeZone: 'America/Bogota', mapCenter: { lat: 6.25, lng: -75.56, zoom: 12 } };

let markets: FakeMarketRepository;
let countries: FakeCountryRepository;
let deps: { markets: FakeMarketRepository; countries: FakeCountryRepository; ids: { newId: () => string }; clock: FixedClock };

beforeEach(() => {
  markets = new FakeMarketRepository();
  countries = new FakeCountryRepository();
  countries.seed(new Country({ id: 'co', name: 'Colombia', dialCode: '+57', countryCode: 'CO', currency: 'COP' }));
  countries.seed(new Country({ id: 've', name: 'Venezuela', dialCode: '+58', countryCode: 'VE', currency: null }));
  let next = 0;
  deps = { markets, countries, ids: { newId: () => `mkt-${++next}` }, clock: new FixedClock('2026-10-15T12:00:00.000Z') };
});

const create = (fields: Partial<typeof MEDELLIN> = {}) =>
  new CreateMarketCommandHandler(deps).handle(new CreateMarketCommand({ ...MEDELLIN, ...fields }, 'staff-1'));

describe('CreateMarketCommandHandler (spec 031, FR-001)', () => {
  it('creates a draft market with a new id', async () => {
    expect(await create()).toEqual({ outcome: 'created', marketId: 'mkt-1' });
    expect(markets.markets.get('mkt-1')).toMatchObject({ name: 'Medellín', countryId: 'co', status: 'draft', createdBy: 'staff-1', revision: 0 });
  });

  it('refuses an unknown country and one without currency', async () => {
    expect(await create({ countryId: 'nope' })).toEqual({ outcome: 'country_not_found' });
    expect(await create({ countryId: 've' })).toEqual({ outcome: 'country_without_currency' });
  });

  it('refuses a time zone the runtime does not know', async () => {
    expect(await create({ timeZone: 'Mars/Olympus' })).toEqual({ outcome: 'invalid', fieldErrors: { timeZone: 'invalid_time_zone' } });
  });

  it('refuses broken fields', async () => {
    expect(await create({ name: 'M', mapCenter: { lat: 99, lng: 0, zoom: 12 } })).toEqual({
      outcome: 'invalid',
      fieldErrors: { name: 'invalid', mapCenter: 'invalid' },
    });
  });

  it('refuses a name already used in the same country', async () => {
    await create();
    expect(await create({ name: 'MEDELLIN' })).toEqual({ outcome: 'market_name_taken' });
  });
});

describe('UpdateMarketCommandHandler (spec 031, FR-001a)', () => {
  const update = (fields: Record<string, unknown>, revision = 0, marketId = 'mkt-1') =>
    new UpdateMarketCommandHandler(deps).handle(new UpdateMarketCommand(marketId, revision, fields));

  beforeEach(async () => {
    await create();
  });

  it('edits the name, time zone and map centre, and bumps the revision', async () => {
    expect(await update({ name: 'Medellín centro', timeZone: 'America/Lima', mapCenter: { lat: 6.2, lng: -75.5, zoom: 13 } })).toEqual({ outcome: 'saved' });
    expect(markets.markets.get('mkt-1')).toMatchObject({ name: 'Medellín centro', timeZone: 'America/Lima', countryId: 'co', revision: 1 });
  });

  it('never changes the country', async () => {
    expect(await update({ countryId: 'pe' })).toEqual({ outcome: 'country_immutable' });
    expect(markets.markets.get('mkt-1')!.countryId).toBe('co');
  });

  it('is stale at an old revision and not found when it does not exist', async () => {
    expect(await update({ name: 'X Y' }, 3)).toEqual({ outcome: 'stale' });
    expect(await update({ name: 'X Y' }, 0, 'nope')).toEqual({ outcome: 'not_found' });
  });

  it('refuses a broken field and a taken name', async () => {
    await create({ name: 'Bogotá' });
    expect(await update({ timeZone: 'Nowhere/Never' })).toEqual({ outcome: 'invalid', fieldErrors: { timeZone: 'invalid_time_zone' } });
    expect(await update({ name: 'bogota' })).toEqual({ outcome: 'market_name_taken' });
  });
});
