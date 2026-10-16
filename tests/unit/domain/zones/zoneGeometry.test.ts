import { describe, expect, it } from 'vitest';
import {
  MAX_ZONE_POSITIONS,
  previewGeometry,
  validateZoneGeometry,
} from '../../../../src/domain/zones/zoneGeometry.js';

/** A square ring of `size` degrees whose south-west corner is (lng, lat). */
const ring = (lng: number, lat: number, size = 0.02) => [
  [lng, lat],
  [lng + size, lat],
  [lng + size, lat + size],
  [lng, lat + size],
  [lng, lat],
];
const square = (lng: number, lat: number, size = 0.02) => ({ type: 'Polygon' as const, coordinates: [ring(lng, lat, size)] });
const codes = (geometry: unknown) => validateZoneGeometry(geometry).map((error) => error.code);

describe('validateZoneGeometry', () => {
  it('accepts a closed square, a polygon with a hole and a multipolygon', () => {
    expect(validateZoneGeometry(square(-75.6, 6.24))).toEqual([]);
    const withHole = { type: 'Polygon', coordinates: [ring(-75.6, 6.24, 0.04), ring(-75.59, 6.25, 0.01)] };
    expect(validateZoneGeometry(withHole)).toEqual([]);
    expect(validateZoneGeometry({ type: 'MultiPolygon', coordinates: [[ring(-75.6, 6.24)], [ring(-75.5, 6.24)]] })).toEqual([]);
  });

  it.each([
    ['a point', { type: 'Point', coordinates: [-75.6, 6.24] }],
    ['no coordinates', { type: 'Polygon' }],
    ['rings that are not lists of positions', { type: 'Polygon', coordinates: [[1, 2, 3]] }],
    ['not an object', 'Polygon'],
  ])('rejects %s as not a polygon', (_label, geometry) => {
    expect(codes(geometry)).toEqual(['geometry_type']);
  });

  it('rejects an open ring and a ring of fewer than 4 positions', () => {
    const open = ring(-75.6, 6.24).slice(0, 4);
    expect(validateZoneGeometry({ type: 'Polygon', coordinates: [open] })).toEqual([
      { code: 'ring_not_closed', message: 'El anillo no está cerrado', polygonIndex: 0, ringIndex: 0 },
    ]);
    const short = [
      [-75.6, 6.24],
      [-75.5, 6.24],
      [-75.6, 6.24],
    ];
    expect(codes({ type: 'Polygon', coordinates: [short] })).toEqual(['ring_too_short']);
  });

  it.each([
    ['a longitude of 181', [181, 6.24]],
    ['a latitude of -91', [-75.6, -91]],
    ['a missing number', [Number.NaN, 6.24]],
  ])('rejects %s', (_label, position) => {
    const bad = ring(-75.6, 6.24);
    bad[1] = position as number[];
    expect(codes({ type: 'Polygon', coordinates: [bad] })).toContain('coordinate_out_of_range');
  });

  it('rejects a polygon that crosses itself, saying where', () => {
    const bowTie = [
      [-75.6, 6.24],
      [-75.58, 6.26],
      [-75.58, 6.24],
      [-75.6, 6.26],
      [-75.6, 6.24],
    ];
    const [error] = validateZoneGeometry({ type: 'MultiPolygon', coordinates: [[ring(-75.5, 6.24)], [bowTie]] });

    expect(error).toMatchObject({ code: 'self_intersection', message: 'El polígono se cruza a sí mismo', polygonIndex: 1, ringIndex: 0 });
    expect(error!.at![0]).toBeCloseTo(-75.59, 5);
    expect(error!.at![1]).toBeCloseTo(6.25, 5);
  });

  it(`rejects more than ${MAX_ZONE_POSITIONS} positions`, () => {
    const many = Array.from({ length: MAX_ZONE_POSITIONS }, (_, i) => {
      const angle = (2 * Math.PI * i) / MAX_ZONE_POSITIONS;
      return [-75.6 + 0.01 * Math.cos(angle), 6.24 + 0.01 * Math.sin(angle)];
    });
    many.push(many[0]!);
    expect(codes({ type: 'Polygon', coordinates: [many] })).toEqual(['too_many_vertices']);
  });
});


describe('real zones (admin feedback 2026-10-08)', () => {
  it('accepts zones traced in detail: up to 20.000 positions', () => {
    expect(MAX_ZONE_POSITIONS).toBe(20000);
    const detailed = Array.from({ length: 9161 }, (_, i) => {
      const angle = (2 * Math.PI * i) / 9161;
      return [-75.55 + 0.05 * Math.cos(angle), 6.2 + 0.05 * Math.sin(angle)];
    });
    detailed.push(detailed[0]!);
    expect(validateZoneGeometry({ type: 'Polygon', coordinates: [detailed] })).toEqual([]);
  });
});

describe('previewGeometry', () => {
  it('drops the points closer than ~6 m to the outline, for the reference map', () => {
    const detailed = Array.from({ length: 4000 }, (_, i) => {
      const angle = (2 * Math.PI * i) / 4000;
      return [-75.55 + 0.05 * Math.cos(angle), 6.2 + 0.05 * Math.sin(angle)];
    });
    detailed.push(detailed[0]!);

    const preview = previewGeometry({ type: 'Polygon', coordinates: [detailed] }) as { type: string; coordinates: number[][][] };

    expect(preview.type).toBe('Polygon');
    expect(preview.coordinates[0]!.length).toBeLessThan(400);
    expect(preview.coordinates[0]![0]).toEqual(preview.coordinates[0]!.at(-1));
  });

  it('keeps a small polygon as it is, and a broken one untouched', () => {
    const small = square(-75.6, 6.24);
    expect(previewGeometry(small)).toEqual(small);
    const broken = { type: 'Polygon' as const, coordinates: [[[0, 0]]] };
    expect(previewGeometry(broken)).toEqual(broken);
  });
});

