import type { ICityRepository } from '../../locations/common/ports.js';
import { resolveAnchorCityId } from '../../locations/common/resolveAnchorCityId.js';
import type { IZoneRepository } from '../../zones/common/ports.js';

export type AvailabilitySelectionValidation =
  | { valid: true; zoneIds: string[] }
  | { valid: false; outcome: 'invalid_city' }
  | { valid: false; outcome: 'invalid_zones'; invalidZoneIds: string[] };

/**
 * The city + zones rule shared by the draft registration's availability save and the
 * active goalkeeper's availability edit, so the two can never drift apart: the city
 * must exist, and every zone must exist, be active, and belong to that city's anchor
 * city. Returns the de-duplicated zone ids to persist.
 */
export async function validateAvailabilitySelection(
  cityRepository: ICityRepository,
  zoneRepository: IZoneRepository,
  cityId: string,
  requestedZoneIds: string[],
): Promise<AvailabilitySelectionValidation> {
  const city = await cityRepository.getById(cityId);
  if (!city) {
    return { valid: false, outcome: 'invalid_city' };
  }

  const anchorCityId = resolveAnchorCityId(city);
  const zoneIds = [...new Set(requestedZoneIds)];
  const zones = await zoneRepository.getManyByIds(zoneIds);
  const zoneById = new Map(zones.map((zone) => [zone.id, zone]));
  const invalidZoneIds = zoneIds.filter((zoneId) => {
    const zone = zoneById.get(zoneId);
    return !zone || !zone.active || zone.cityId !== anchorCityId;
  });
  if (invalidZoneIds.length > 0) {
    return { valid: false, outcome: 'invalid_zones', invalidZoneIds };
  }

  return { valid: true, zoneIds };
}
