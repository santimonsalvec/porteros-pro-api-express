import { area } from '@turf/area';
import { featureCollection, lineString } from '@turf/helpers';
import { intersect } from '@turf/intersect';
import { kinks } from '@turf/kinks';
import { pointToPolygonDistance } from '@turf/point-to-polygon-distance';
import { simplify } from '@turf/simplify';
import type { Feature, MultiPolygon, Polygon, Position } from 'geojson';
import type { ZoneGeometry } from './zone.js';

/**
 * The rules a zone's polygon must follow before it is saved (admin spec 003, research §2), and
 * the warnings it may raise against the other zones of its city. Seeded zones are never checked
 * on read: a broken one is only reported (and skipped as a neighbour).
 */

/** Zones are traced from official boundaries: Medellín's have up to ~9.000 positions. */
export const MAX_ZONE_POSITIONS = 20000;
/** Overlaps smaller than this are slivers of a shared border drawn by hand. */
export const OVERLAP_THRESHOLD_SQUARE_METERS = 1000;
export const FAR_FROM_CITY_KM = 5;

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
  ring_too_short: 'El anillo necesita al menos 4 puntos',
  coordinate_out_of_range: 'Hay coordenadas fuera de rango',
  self_intersection: 'El polígono se cruza a sí mismo',
  too_many_vertices: `El polígono tiene más de ${MAX_ZONE_POSITIONS.toLocaleString('es-CO')} puntos`,
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

/** Another zone of the same city, as the warnings compare against it. */
export interface NeighborZone {
  id: string;
  name: string;
  displayOrder: number;
  active: boolean;
  geometry: ZoneGeometry;
}

export type GeometryWarning =
  | { code: 'overlaps_zone'; zoneId: string; zoneName: string; overlapSquareMeters: number; winsZoneId: string; winsZoneName: string }
  | { code: 'far_from_city_zones'; maxDistanceKm: number };

/** Which zone a point in both resolves to: lower `displayOrder`, then lower id (as `findActiveContainingPoint`). */
function winner(self: { id: string | null; displayOrder: number }, other: NeighborZone): string | null {
  if (self.displayOrder !== other.displayOrder) return self.displayOrder < other.displayOrder ? self.id : other.id;
  // A zone not created yet has no id: the existing one is assumed to win the tie.
  return self.id !== null && self.id < other.id ? self.id : other.id;
}

/**
 * Overlaps with the active zones of the city, and how far the polygon reaches from them
 * (decision D-3: warn, never block, since a city has no official boundary). Call only with a
 * polygon `validateZoneGeometry` accepted.
 */
export function zoneGeometryWarnings(
  geometry: ZoneGeometry,
  self: { id: string | null; displayOrder: number },
  zones: readonly NeighborZone[],
): GeometryWarning[] {
  const shape = geometry as unknown as Polygon | MultiPolygon;
  const others = zones.filter((zone) => zone.active && zone.id !== self.id && validateZoneGeometry(zone.geometry).length === 0);
  if (others.length === 0) return [];

  const warnings: GeometryWarning[] = [];
  for (const other of others) {
    const shared = intersect(featureCollection([feature(shape), feature(other.geometry as unknown as Polygon | MultiPolygon)]));
    const overlap = shared ? area(shared) : 0;
    if (overlap > OVERLAP_THRESHOLD_SQUARE_METERS) {
      const winsZoneId = winner(self, other) ?? 'new';
      warnings.push({
        code: 'overlaps_zone',
        zoneId: other.id,
        zoneName: other.name,
        overlapSquareMeters: Math.round(overlap),
        winsZoneId,
        winsZoneName: winsZoneId === other.id ? other.name : 'esta zona',
      });
    }
  }

  const vertices = (polygonsOf(shape) ?? []).flat(2) as unknown as number[][];
  const distanceToCity = (vertex: number[]) =>
    Math.min(...others.map((other) => Math.max(0, pointToPolygonDistance(vertex as Position, other.geometry as unknown as Polygon | MultiPolygon, { units: 'kilometers' }))));
  const maxDistanceKm = Math.max(...vertices.map(distanceToCity));
  if (maxDistanceKm > FAR_FROM_CITY_KM) warnings.push({ code: 'far_from_city_zones', maxDistanceKm: Math.round(maxDistanceKm * 10) / 10 });
  return warnings;
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
