import { describe, expect, it } from 'vitest';
import { boundingBoxesTouch, findZoneConflicts, type ConflictCandidate } from '../../../../src/domain/zones/zoneGeometry.js';
import type { ZoneGeometry } from '../../../../src/domain/zones/zone.js';

/** A square of `size` degrees whose south-west corner is (lng, lat). */
const square = (lng: number, lat: number, size = 0.02): ZoneGeometry => ({
  type: 'Polygon',
  coordinates: [[[lng, lat], [lng + size, lat], [lng + size, lat + size], [lng, lat + size], [lng, lat]]],
});

const candidate = (id: string, geometry: ZoneGeometry, marketId = 'med'): ConflictCandidate => ({
  id,
  name: id,
  marketId,
  marketName: marketId === 'med' ? 'Medellín' : 'Otra',
  geometry,
});

describe('findZoneConflicts (spec 031, FR-003, research §2)', () => {
  it('finds a zone that shares area', () => {
    const found = findZoneConflicts(square(-75.6, 6.2), null, [candidate('a', square(-75.59, 6.21))]);
    expect(found.map((zone) => zone.zoneId)).toEqual(['a']);
  });

  it('finds a zone that only shares a border', () => {
    const found = findZoneConflicts(square(-75.6, 6.2), null, [candidate('right', square(-75.58, 6.2))]);
    expect(found.map((zone) => zone.zoneId)).toEqual(['right']);
  });

  it('finds a zone that only shares a corner', () => {
    const found = findZoneConflicts(square(-75.6, 6.2), null, [candidate('corner', square(-75.58, 6.22))]);
    expect(found.map((zone) => zone.zoneId)).toEqual(['corner']);
  });

  it('leaves out a zone a metre away', () => {
    const metre = 0.00001;
    expect(findZoneConflicts(square(-75.6, 6.2), null, [candidate('near', square(-75.58 + metre, 6.2))])).toEqual([]);
  });

  it('ignores the zone being edited and zones with a broken polygon', () => {
    const broken = { type: 'Polygon', coordinates: [[[0, 0]]] } as ZoneGeometry;
    const found = findZoneConflicts(square(-75.6, 6.2), 'self', [candidate('self', square(-75.6, 6.2)), candidate('broken', broken)]);
    expect(found).toEqual([]);
  });

  it('compares against zones of every market and says whose they are', () => {
    const found = findZoneConflicts(square(-75.6, 6.2), null, [candidate('other', square(-75.59, 6.21), 'bog')]);
    expect(found).toEqual([{ zoneId: 'other', zoneName: 'other', marketId: 'bog', marketName: 'Otra' }]);
  });

  it('works with a MultiPolygon', () => {
    const multi: ZoneGeometry = { type: 'MultiPolygon', coordinates: [square(-80, 1).coordinates, square(-75.6, 6.2).coordinates] };
    expect(findZoneConflicts(multi, null, [candidate('a', square(-75.59, 6.21))]).map((zone) => zone.zoneId)).toEqual(['a']);
  });

  it('tells cheaply when two bounding boxes cannot touch, borders included', () => {
    expect(boundingBoxesTouch(square(-75.6, 6.2), square(-74, 4.6))).toBe(false);
    expect(boundingBoxesTouch(square(-75.6, 6.2), square(-75.58, 6.2))).toBe(true);
    expect(boundingBoxesTouch(square(-75.6, 6.2), square(-75.59, 6.21))).toBe(true);
  });
});
