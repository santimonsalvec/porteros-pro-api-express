import { describe, expect, it } from 'vitest';
import { SaveZoneCommand } from '../../../../../src/application/features/geography/commands/saveZone/saveZoneCommand.js';
import { SaveZoneCommandHandler } from '../../../../../src/application/features/geography/commands/saveZone/saveZoneCommandHandler.js';
import { geographyKit } from './geographyTestKit.js';

const square = (lng: number, lat: number) => ({
  type: 'Polygon' as const,
  coordinates: [[[lng, lat], [lng + 0.02, lat], [lng + 0.02, lat + 0.02], [lng, lat + 0.02], [lng, lat]]],
});
const BELEN = { cityId: 'med', name: 'Belén', slug: 'belen', geometry: square(-75.62, 6.2), active: true, displayOrder: 2 };

function setup() {
  const kit = geographyKit();
  return { kit, save: (command: SaveZoneCommand) => new SaveZoneCommandHandler(kit).handle(command) };
}

describe('SaveZoneCommandHandler — create', () => {
  it('creates a zone in an anchor city', async () => {
    const { kit, save } = setup();

    expect(await save(SaveZoneCommand.create(BELEN))).toEqual({ outcome: 'saved', zoneId: 'new-1', action: 'create' });
    expect(kit.zones.items.get('new-1')).toMatchObject({ cityId: 'med', slug: 'belen', revision: 0 });
  });

  it('refuses a satellite city, an unknown city, a taken slug and a broken polygon', async () => {
    const { save } = setup();
    expect(await save(SaveZoneCommand.create({ ...BELEN, cityId: 'env' }))).toEqual({ outcome: 'zone_city_not_anchor', anchorCity: { id: 'med', name: 'Medellín' } });
    expect(await save(SaveZoneCommand.create({ ...BELEN, cityId: 'nope' }))).toEqual({ outcome: 'city_not_found' });
    expect(await save(SaveZoneCommand.create({ ...BELEN, slug: 'laureles' }))).toEqual({ outcome: 'zone_slug_taken' });
    expect(await save(SaveZoneCommand.create({ ...BELEN, geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [0, 0]]] } }))).toMatchObject({
      outcome: 'invalid_geometry',
      errors: [{ code: 'ring_too_short' }],
    });
  });

  it('holds a polygon with warnings until they are acknowledged', async () => {
    const { kit, save } = setup();
    const overlapping = { ...BELEN, geometry: square(-75.59, 6.24) };

    expect(await save(SaveZoneCommand.create(overlapping))).toMatchObject({ outcome: 'warnings', warnings: [{ code: 'overlaps_zone' }] });
    expect(kit.zones.items.size).toBe(1);
    expect(await save(SaveZoneCommand.create(overlapping, true))).toMatchObject({ outcome: 'saved' });
  });
});

describe('SaveZoneCommandHandler — edit', () => {
  it('saves name and order changes over what is stored', async () => {
    const { kit, save } = setup();

    expect(await save(SaveZoneCommand.edit('z-laureles', 0, { name: 'Laureles-Estadio', displayOrder: 3 }))).toEqual({
      outcome: 'saved',
      zoneId: 'z-laureles',
      action: 'update',
    });
    expect(kit.zones.items.get('z-laureles')).toMatchObject({ name: 'Laureles-Estadio', displayOrder: 3, slug: 'laureles', revision: 1 });
  });

  it('asks a reason to deactivate, and names the action', async () => {
    const { save } = setup();
    expect(await save(SaveZoneCommand.edit('z-laureles', 0, { active: false }))).toEqual({ outcome: 'reason_required' });
    expect(await save(SaveZoneCommand.edit('z-laureles', 0, { active: false }, 'Cierre temporal'))).toMatchObject({ action: 'deactivate' });
    expect(await save(SaveZoneCommand.edit('z-laureles', 1, { active: true }))).toMatchObject({ action: 'reactivate' });
  });

  it('asks a reason to redraw a zone in use, but not one nobody uses', async () => {
    const { kit, save } = setup();
    const redrawn = square(-75.601, 6.24);

    kit.usage.use('z-laureles', 'zone_in_use');
    expect(await save(SaveZoneCommand.edit('z-laureles', 0, { geometry: redrawn }))).toEqual({ outcome: 'reason_required' });
    expect(await save(SaveZoneCommand.edit('z-laureles', 0, { geometry: redrawn }, 'Ajuste del límite'))).toMatchObject({ outcome: 'saved' });

    kit.usage.reasons.clear();
    expect(await save(SaveZoneCommand.edit('z-laureles', 1, { geometry: square(-75.602, 6.24) }))).toMatchObject({ outcome: 'saved' });
  });

  it('keeps its own slug, refuses another zone’s, and reports stale or missing zones', async () => {
    const { kit, save } = setup();
    await save(SaveZoneCommand.create(BELEN));

    expect(await save(SaveZoneCommand.edit('z-laureles', 0, { slug: 'laureles' }))).toMatchObject({ outcome: 'saved' });
    expect(await save(SaveZoneCommand.edit('z-laureles', 1, { slug: 'belen' }))).toEqual({ outcome: 'zone_slug_taken' });
    expect(await save(SaveZoneCommand.edit('z-laureles', 0, { name: 'X' }))).toEqual({ outcome: 'stale' });
    expect(await save(SaveZoneCommand.edit('nope', 0, { name: 'X' }))).toEqual({ outcome: 'not_found' });
    expect(kit.zones.items.get('z-laureles')!.cityId).toBe('med');
  });
});
