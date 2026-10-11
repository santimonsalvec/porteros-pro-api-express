import type { City } from '../../../../domain/locations/city.js';
import type { ZoneGeometry } from '../../../../domain/zones/zone.js';
import { validateZoneGeometry, zoneGeometryWarnings, type GeometryError } from '../../../../domain/zones/zoneGeometry.js';
import type { IAdminCityRepository, IAdminZoneRepository } from './ports.js';
import { warning, type Warning } from './warnings.js';

/** Where a zone may live: an existing city that owns its zones (`zoneCityId = null`). */
export type ZoneCityCheck =
  | { outcome: 'ok'; city: City }
  | { outcome: 'city_not_found' }
  | { outcome: 'zone_city_not_anchor'; anchorCity: { id: string; name: string } };

export async function checkZoneCity(cities: IAdminCityRepository, cityId: string): Promise<ZoneCityCheck> {
  const city = await cities.getById(cityId);
  if (!city) return { outcome: 'city_not_found' };
  if (city.zoneCityId === null) return { outcome: 'ok', city };
  const anchor = await cities.getById(city.zoneCityId);
  return { outcome: 'zone_city_not_anchor', anchorCity: { id: city.zoneCityId, name: anchor?.name ?? '' } };
}

export interface GeometryReview {
  errors: GeometryError[];
  warnings: Warning[];
}

/**
 * The polygon's errors and, when it has none, its warnings against the other zones of the city
 * (research §2–§3). `self.id` is the zone being edited, left out of the comparison.
 */
export async function reviewZoneGeometry(
  zones: IAdminZoneRepository,
  cityId: string,
  geometry: unknown,
  self: { id: string | null; displayOrder: number },
): Promise<GeometryReview> {
  const errors = validateZoneGeometry(geometry);
  if (errors.length > 0) return { errors, warnings: [] };
  const found = zoneGeometryWarnings(geometry as ZoneGeometry, self, await zones.listByCity(cityId));
  return {
    errors: [],
    // The domain's warnings carry exactly the data of their message (`WarningData`).
    warnings: found.map(({ code, ...data }) => warning(code, data as never)),
  };
}

/** A new zone goes last unless it says otherwise. */
export const NEW_ZONE_ORDER = 9999;
