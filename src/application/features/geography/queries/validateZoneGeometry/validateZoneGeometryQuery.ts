import { IQuery } from '../../../../common/mediator/types.js';
import type { GeometryReview, ZoneCityCheck } from '../../common/zoneChecks.js';

export type ValidateZoneGeometryResult = ({ outcome: 'ok' } & GeometryReview) | Exclude<ZoneCityCheck, { outcome: 'ok' }>;

/** Checks a polygon while it is being drawn, without saving or auditing (admin spec 003, research §3). */
export class ValidateZoneGeometryQuery extends IQuery<ValidateZoneGeometryResult> {
  constructor(
    readonly cityId: string,
    readonly geometry: unknown,
    readonly zoneId: string | null = null,
    readonly displayOrder: number | null = null,
  ) {
    super();
  }
}
