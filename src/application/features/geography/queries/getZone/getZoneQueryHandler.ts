import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { IAdminZoneRepository, IReferenceUsage } from '../../common/ports.js';
import { toZoneViews } from '../../common/views.js';
import { GetZoneQuery, type GetZoneResult } from './getZoneQuery.js';

export class GetZoneQueryHandler implements IQueryHandler<GetZoneQuery, GetZoneResult> {
  constructor(private readonly deps: { zones: IAdminZoneRepository; usage: IReferenceUsage }) {}

  async handle(query: GetZoneQuery): Promise<GetZoneResult> {
    const zone = await this.deps.zones.getById(query.zoneId);
    if (!zone) return { outcome: 'not_found' };
    const [view] = await toZoneViews([zone], this.deps.usage);
    return { outcome: 'ok', zone: view! };
  }
}
