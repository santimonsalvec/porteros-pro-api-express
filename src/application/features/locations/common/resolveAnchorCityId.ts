import type { City } from '../../../../domain/locations/city.js';

/**
 * Resolves the city that actually owns `Zone` documents for a given city: itself,
 * unless it's a satellite of a larger metro area, in which case `zoneCityId` points
 * to the anchor (research.md §2).
 */
export function resolveAnchorCityId(city: City): string {
  return city.zoneCityId ?? city.id;
}
