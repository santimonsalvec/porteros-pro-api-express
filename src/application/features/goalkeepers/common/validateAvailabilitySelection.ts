import type { IMarketRepository } from '../../markets/common/ports.js';
import type { IZoneRepository } from '../../zones/common/ports.js';

export type AvailabilitySelectionValidation =
  | { valid: true; zoneIds: string[] }
  | { valid: false; outcome: 'invalid_market' }
  | { valid: false; outcome: 'invalid_zones'; invalidZoneIds: string[] };

/**
 * The market + zones rule shared by the draft registration's availability save and the
 * active goalkeeper's availability edit, so the two can never drift apart (spec 031, FR-022):
 * the market must exist and be enabled, and every zone must exist, be active, and belong to that market.
 * Returns the de-duplicated zone ids to persist.
 */
export async function validateAvailabilitySelection(
  marketRepository: Pick<IMarketRepository, 'getById'>,
  zoneRepository: IZoneRepository,
  marketId: string,
  requestedZoneIds: string[],
  /** The goalkeeper's own market may be disabled: they still pick their zones there. */
  options: { allowDisabled?: boolean } = {},
): Promise<AvailabilitySelectionValidation> {
  const market = await marketRepository.getById(marketId);
  const open = market?.status === 'enabled' || (options.allowDisabled === true && market?.status === 'disabled');
  if (!market || !open) {
    return { valid: false, outcome: 'invalid_market' };
  }

  const zoneIds = [...new Set(requestedZoneIds)];
  const zones = await zoneRepository.getManyByIds(zoneIds);
  const zoneById = new Map(zones.map((zone) => [zone.id, zone]));
  const invalidZoneIds = zoneIds.filter((zoneId) => {
    const zone = zoneById.get(zoneId);
    return !zone || !zone.active || zone.marketId !== market.id;
  });
  if (invalidZoneIds.length > 0) {
    return { valid: false, outcome: 'invalid_zones', invalidZoneIds };
  }

  return { valid: true, zoneIds };
}
