import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { IAdminMatchSurfaceRepository, IReferenceUsage } from '../../common/ports.js';
import { pageOf, toMatchSurfaceViews, type MatchSurfaceView, type Page } from '../../common/views.js';
import { ListMatchSurfacesQuery } from './listMatchSurfacesQuery.js';

export class ListMatchSurfacesQueryHandler implements IQueryHandler<ListMatchSurfacesQuery, Page<MatchSurfaceView>> {
  constructor(private readonly deps: { surfaces: IAdminMatchSurfaceRepository; usage: IReferenceUsage }) {}

  async handle(query: ListMatchSurfacesQuery): Promise<Page<MatchSurfaceView>> {
    const found = await this.deps.surfaces.list({ ...query.filters, page: query.page, pageSize: query.pageSize });
    return pageOf(await toMatchSurfaceViews(found.items, this.deps.usage), query.page, query.pageSize, found.totalItems);
  }
}
