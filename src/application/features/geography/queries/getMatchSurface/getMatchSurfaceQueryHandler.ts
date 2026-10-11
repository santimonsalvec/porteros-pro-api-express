import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { IAdminMatchSurfaceRepository, IReferenceUsage } from '../../common/ports.js';
import { toMatchSurfaceViews } from '../../common/views.js';
import { GetMatchSurfaceQuery, type GetMatchSurfaceResult } from './getMatchSurfaceQuery.js';

export class GetMatchSurfaceQueryHandler implements IQueryHandler<GetMatchSurfaceQuery, GetMatchSurfaceResult> {
  constructor(private readonly deps: { surfaces: IAdminMatchSurfaceRepository; usage: IReferenceUsage }) {}

  async handle(query: GetMatchSurfaceQuery): Promise<GetMatchSurfaceResult> {
    const found = await this.deps.surfaces.getById(query.surfaceId);
    if (!found) return { outcome: 'not_found' };
    const [view] = await toMatchSurfaceViews([found], this.deps.usage);
    return { outcome: 'ok', surface: view! };
  }
}
