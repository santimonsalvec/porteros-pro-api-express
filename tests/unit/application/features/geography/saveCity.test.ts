import { describe, expect, it } from 'vitest';
import { SaveCityCommand } from '../../../../../src/application/features/geography/commands/saveCity/saveCityCommand.js';
import { SaveCityCommandHandler } from '../../../../../src/application/features/geography/commands/saveCity/saveCityCommandHandler.js';
import { geographyKit } from './geographyTestKit.js';

const ENVIGADO = { name: 'Envigado', regionId: 'ant', daneStateCode: '05', daneCityCode: '05266' };

function setup() {
  const kit = geographyKit();
  return { kit, save: (command: SaveCityCommand) => new SaveCityCommandHandler(kit).handle(command) };
}

describe('SaveCityCommandHandler — create (billing municipalities, spec 031)', () => {
  it('creates a municipality at revision 0 with a new id', async () => {
    const { kit, save } = setup();

    const result = await save(SaveCityCommand.create({ ...ENVIGADO, name: 'Sabaneta' }));

    expect(result).toEqual({ outcome: 'saved', cityId: 'new-1', created: true });
    expect(kit.cities.items.get('new-1')).toMatchObject({ name: 'Sabaneta', regionId: 'ant', daneCityCode: '05266', revision: 0 });
  });

  it.each([
    ['an unknown region', { regionId: 'nope' }, 'regionId'],
    ['a municipality outside its department', { daneCityCode: '06001' }, 'daneCityCode'],
    ['a malformed department', { daneStateCode: '5' }, 'daneStateCode'],
  ])('rejects %s on its field', async (_label, override, field) => {
    const { save } = setup();

    const result = await save(SaveCityCommand.create({ ...ENVIGADO, ...override }));

    expect(result.outcome).toBe('invalid');
    expect(Object.keys(result.outcome === 'invalid' ? result.fieldErrors : {})).toEqual([field]);
  });
});

describe('SaveCityCommandHandler — edit', () => {
  it('saves the changes over what is stored and bumps the revision', async () => {
    const { kit, save } = setup();

    const result = await save(SaveCityCommand.edit('ita', 0, { daneStateCode: '05', daneCityCode: '05360' }));

    expect(result).toEqual({ outcome: 'saved', cityId: 'ita', created: false });
    expect(kit.cities.items.get('ita')).toMatchObject({ name: 'Itagüí', daneCityCode: '05360', revision: 1 });
  });

  it('is stale when the revision read is old, and not found when it is gone', async () => {
    const { save } = setup();
    expect(await save(SaveCityCommand.edit('med', 1, { name: 'Medellín' }))).toEqual({ outcome: 'stale' });
    expect(await save(SaveCityCommand.edit('nope', 0, { name: 'X' }))).toEqual({ outcome: 'not_found' });
  });
});
