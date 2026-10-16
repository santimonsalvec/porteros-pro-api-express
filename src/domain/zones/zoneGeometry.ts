import { booleanDisjoint } from '@turf/boolean-disjoint';
import { lineString } from '@turf/helpers';
import { kinks } from '@turf/kinks';
import { simplify } from '@turf/simplify';
import type { Feature, MultiPolygon, Polygon, Position } from 'geojson';
import type { ZoneGeometry } from './zone.js';

/**
 * The rules a zone's polygon must follow before it is saved (admin spec 003, research §2), and
 * the active zones it may not cross or touch (spec 031). Seeded zones are never checked
 * on read: a broken one is only reported (and skipped as a neighbour).
 */

/** Zones are traced from official boundaries: Medellín's have up to ~9.000 positions. */
export const MAX_ZONE_POSITIONS = 20000;

export type GeometryErrorCode =
  | 'geometry_type'
  | 'ring_not_closed'
  | 'ring_too_short'
  | 'coordinate_out_of_range'
  | 'self_intersection'
  | 'too_many_vertices';

export interface GeometryError {
  code: GeometryErrorCode;
  message: string;
  at?: [number, number];
  polygonIndex?: number;
  ringIndex?: number;
}

const MESSAGES: Record<GeometryErrorCode, string> = {
  geometry_type: 'La geometría debe ser un Polygon o un MultiPolygon',
  ring_not_closed: 'El anillo no está cerrado',
  ring_too_short: 'El anillo necesita al menos 4 vértices',
  coordinate_out_of_range: 'Hay coordenadas fuera de rango',
  self_intersection: 'El polígono se cruza a sí mismo',
  too_many_vertices: `El polígono tiene más de ${MAX_ZONE_POSITIONS.toLocaleString('es-CO')} vértices`,
};

const error = (code: GeometryErrorCode, where: Omit<GeometryError, 'code' | 'message'> = {}): GeometryError => ({
  code,
  message: MESSAGES[code],
  ...where,
});

type Ring = number[][];

/** The polygons (each a list of rings) of a well-shaped geometry, or null. */
function polygonsOf(geometry: unknown): Ring[][] | null {
  if (typeof geometry !== 'object' || geometry === null) return null;
  const { type, coordinates } = geometry as { type?: unknown; coordinates?: unknown };
  const isRing = (value: unknown): value is Ring =>
    Array.isArray(value) && value.every((position) => Array.isArray(position) && position.length >= 2);
  const isPolygon = (value: unknown): value is Ring[] => Array.isArray(value) && value.length > 0 && value.every(isRing);
  if (type === 'Polygon' && isPolygon(coordinates)) return [coordinates];
  if (type === 'MultiPolygon' && Array.isArray(coordinates) && coordinates.length > 0 && coordinates.every(isPolygon)) return coordinates;
  return null;
}

const inRange = ([lng, lat]: number[]) =>
  Number.isFinite(lng) && Number.isFinite(lat) && lng! >= -180 && lng! <= 180 && lat! >= -90 && lat! <= 90;

/** Every rule the polygon breaks; empty when it can be saved. */
export function validateZoneGeometry(geometry: unknown): GeometryError[] {
  const polygons = polygonsOf(geometry);
  if (!polygons) return [error('geometry_type')];
  if (polygons.flat().reduce((total, ring) => total + ring.length, 0) > MAX_ZONE_POSITIONS) return [error('too_many_vertices')];

  const errors: GeometryError[] = [];
  polygons.forEach((rings, polygonIndex) =>
    rings.forEach((ring, ringIndex) => {
      const where = { polygonIndex, ringIndex };
      if (!ring.every(inRange)) return void errors.push(error('coordinate_out_of_range', where));
      if (ring.length < 4) return void errors.push(error('ring_too_short', where));
      const [first, last] = [ring[0]!, ring[ring.length - 1]!];
      if (first[0] !== last[0] || first[1] !== last[1]) return void errors.push(error('ring_not_closed', where));
      const crossing = kinks(lineString(ring as Position[])).features[0];
      if (crossing) errors.push(error('self_intersection', { at: crossing.geometry.coordinates as [number, number], ...where }));
    }),
  );
  return errors;
}

/** An active zone a new or edited one is compared against (spec 031, FR-003). */
export interface ConflictCandidate {
  id: string;
  name: string;
  marketId: string;
  marketName: string;
  geometry: ZoneGeometry;
}

export interface ZoneConflict {
  zoneId: string;
  zoneName: string;
  marketId: string;
  marketName: string;
}

type Box = [minLng: number, minLat: number, maxLng: number, maxLat: number];

function boxOf(geometry: ZoneGeometry): Box | null {
  const polygons = polygonsOf(geometry);
  if (!polygons) return null;
  const positions = polygons.flat(2) as unknown as number[][];
  if (positions.length === 0) return null;
  const lngs = positions.map((position) => position[0]!);
  const lats = positions.map((position) => position[1]!);
  return [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)];
}

/** Whether two bounding boxes overlap or touch: a cheap test before the exact one. */
export function boundingBoxesTouch(a: ZoneGeometry, b: ZoneGeometry): boolean {
  const first = boxOf(a);
  const second = boxOf(b);
  if (!first || !second) return false;
  return first[0] <= second[2] && second[0] <= first[2] && first[1] <= second[3] && second[1] <= first[3];
}

/**
 * The zones `geometry` is not disjoint from (spec 031, FR-003, research §2): any shared area, a
 * shared border or a single shared corner counts. `selfId` is the zone being edited, and zones
 * whose polygon breaks the rules are left out (they are reported apart). Call only with a polygon
 * `validateZoneGeometry` accepted.
 */
export function findZoneConflicts(geometry: ZoneGeometry, selfId: string | null, candidates: readonly ConflictCandidate[]): ZoneConflict[] {
  const shape = feature(geometry as unknown as Polygon | MultiPolygon);
  return candidates
    .filter((other) => other.id !== selfId && validateZoneGeometry(other.geometry).length === 0)
    .filter((other) => boundingBoxesTouch(geometry, other.geometry))
    .filter((other) => !booleanDisjoint(shape, feature(other.geometry as unknown as Polygon | MultiPolygon)))
    .map((other) => ({ zoneId: other.id, zoneName: other.name, marketId: other.marketId, marketName: other.marketName }));
}

function feature(shape: Polygon | MultiPolygon): Feature<Polygon | MultiPolygon> {
  return { type: 'Feature', properties: {}, geometry: shape };
}

/** ~6 m: invisible at the zoom a city's zones are seen, and about 8× lighter for real zones. */
const PREVIEW_TOLERANCE_DEGREES = 0.00005;

/**
 * A lighter copy of the polygon to draw as a reference on the admin's map. Only for showing:
 * saving and the quote always use the full polygon. A broken polygon is returned as it is.
 */
export function previewGeometry(geometry: ZoneGeometry): ZoneGeometry {
  if (validateZoneGeometry(geometry).some((error) => error.code !== 'self_intersection' && error.code !== 'too_many_vertices')) return geometry;
  return simplify(geometry as unknown as Polygon | MultiPolygon, { tolerance: PREVIEW_TOLERANCE_DEGREES, highQuality: false, mutate: false }) as unknown as ZoneGeometry;
}
