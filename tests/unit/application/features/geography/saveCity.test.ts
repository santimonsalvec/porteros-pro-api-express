import { describe, expect, it } from 'vitest';
import { SaveCityCommand } from '../../../../../src/application/features/geography/commands/saveCity/saveCityCommand.js';
import { SaveCityCommandHandler } from '../../../../../src/application/features/geography/commands/saveCity/saveCityCommandHandler.js';
import { geographyKit } from './geographyTestKit.js';

const ENVIGADO = { name: 'Envigado', regionId: 'ant', timeZone: 'America/Bogota', zoneCityId: 'med', daneStateCode: '05', daneCityCode: '05266' };

function setup() {
  const kit = geographyKit();
  return { kit, save: (command: SaveCityCommand) => new SaveCityCommandHandler(kit).handle(command) };
}

describe('SaveCityCommandHandler — create', () => {
  it('creates a city at revision 0 with a new id', async () => {
    const { kit, save } = setup();

    const result = await save(SaveCityCommand.create({ ...ENVIGADO, name: 'Sabaneta' }));

    expect(result).toEqual({ outcome: 'saved', cityId: 'new-1', created: true });
    expect(kit.cities.items.get('new-1')).toMatchObject({ name: 'Sabaneta', regionId: 'ant', zoneCityId: 'med', daneCityCode: '05266', revision: 0 });
  });

  it.each([
    ['an unknown region', { regionId: 'nope' }, 'regionId'],
    ['an alias time zone', { timeZone: 'US/Eastern' }, 'timeZone'],
    ['a municipality outside its department', { daneCityCode: '06001' }, 'daneCityCode'],
    ['a malformed department', { daneStateCode: '5' }, 'daneStateCode'],
    ['an unknown anchor', { zoneCityId: 'nope' }, 'zoneCityId'],
    ['a satellite as anchor (no chains)', { zoneCityId: 'env' }, 'zoneCityId'],
  ])('rejects %s on its field', async (_label, override, field) => {
    const { save } = setup();

    const result = await save(SaveCityCommand.create({ ...ENVIGADO, ...override }));

    expect(result.outcome).toBe('invalid');
    expect(Object.keys(result.outcome === 'invalid' ? result.fieldErrors : {})).toEqual([field]);
  });

  it('names the anchor error with its code', async () => {
    const { save } = setup();
    const result = await save(SaveCityCommand.create({ ...ENVIGADO, zoneCityId: 'env' }));
    expect(result).toEqual({ outcome: 'invalid', fieldErrors: { zoneCityId: 'invalid_anchor_city' } });
  });
});

describe('SaveCityCommandHandler — edit', () => {
  it('saves the changes over what is stored and bumps the revision', async () => {
    const { kit, save } = setup();

    const result = await save(SaveCityCommand.edit('ita', 0, { timeZone: 'America/Bogota', daneStateCode: '05', daneCityCode: '05360' }));

    expect(result).toEqual({ outcome: 'saved', cityId: 'ita', created: false });
    expect(kit.cities.items.get('ita')).toMatchObject({ name: 'Itagüí', timeZone: 'America/Bogota', daneCityCode: '05360', revision: 1 });
  });

  it('is stale when the revision read is old, and not found when it is gone', async () => {
    const { save } = setup();
    expect(await save(SaveCityCommand.edit('med', 1, { name: 'Medellín' }))).toEqual({ outcome: 'stale' });
    expect(await save(SaveCityCommand.edit('nope', 0, { name: 'X' }))).toEqual({ outcome: 'not_found' });
  });

  it('keeps an anchor with zones or satellites from becoming a satellite', async () => {
    const { kit, save } = setup();
    kit.cities.items.set('bog', kit.cities.items.get('ita')!);
    expect(await save(SaveCityCommand.edit('med', 2, { zoneCityId: 'ita' }))).toEqual({ outcome: 'city_has_zones' });
  });

  it('lets a city without zones or satellites use an anchor', async () => {
    const { kit, save } = setup();
    expect(await save(SaveCityCommand.edit('ita', 0, { zoneCityId: 'med' }))).toMatchObject({ outcome: 'saved' });
    expect(kit.cities.items.get('ita')!.zoneCityId).toBe('med');
  });

  it('warns before changing the time zone of an area with future matches, and saves once acknowledged', async () => {
    const { kit, save } = setup();
    kit.futureBookings.areasWithFutureRequests.add('med');

    const held = await save(SaveCityCommand.edit('env', 0, { timeZone: 'America/Lima' }));
    expect(held).toEqual({
      outcome: 'warnings',
      warnings: [{ code: 'time_zone_has_future_bookings', message: expect.any(String), data: {} }],
    });
    expect(kit.cities.items.get('env')!.timeZone).toBe('America/Bogota');

    expect(await save(SaveCityCommand.edit('env', 0, { timeZone: 'America/Lima' }, true))).toMatchObject({ outcome: 'saved' });
    expect(kit.cities.items.get('env')!.timeZone).toBe('America/Lima');
  });

  it('does not warn when the time zone stays the same', async () => {
    const { kit, save } = setup();
    kit.futureBookings.areasWithFutureRequests.add('med');
    expect(await save(SaveCityCommand.edit('env', 0, { name: 'Envigado' }))).toMatchObject({ outcome: 'saved' });
  });
});
