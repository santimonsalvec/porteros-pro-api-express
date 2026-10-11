import { IQuery } from '../../../../common/mediator/types.js';

export interface ListTimeZonesResult {
  timeZones: readonly string[];
}

/** The time zones the city form offers (spec 003 of the admin, `GET /admin/time-zones`). */
export class ListTimeZonesQuery extends IQuery<ListTimeZonesResult> {}
