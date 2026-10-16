import { IQuery } from '../../../../common/mediator/types.js';
import type { GeometryReview, ZoneMarketCheck } from '../../common/zoneChecks.js';

export type ValidateZoneGeometryResult = ({ outcome: 'ok' } & GeometryReview) | Exclude<ZoneMarketCheck, { outcome: 'ok' }>;

/** Checks a polygon while it is being drawn, without saving or auditing (admin spec 003; spec 031, contract §D). */
export class ValidateZoneGeometryQuery extends IQuery<ValidateZoneGeometryResult> {
  constructor(
    readonly marketId: string,
    readonly geometry: unknown,
    readonly zoneId: string | null = null,
    /** Whether the zone would be active: an inactive one is never compared (FR-003). */
    readonly active: boolean = true,
  ) {
    super();
  }
}
