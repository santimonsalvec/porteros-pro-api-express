import type { IQueryHandler } from '../../../../common/mediator/types.js';
import { supportedTimeZones } from '../../common/timeZones.js';
import { ListTimeZonesQuery, type ListTimeZonesResult } from './listTimeZonesQuery.js';

export class ListTimeZonesQueryHandler implements IQueryHandler<ListTimeZonesQuery, ListTimeZonesResult> {
  async handle(_query: ListTimeZonesQuery): Promise<ListTimeZonesResult> {
    return { timeZones: supportedTimeZones() };
  }
}
