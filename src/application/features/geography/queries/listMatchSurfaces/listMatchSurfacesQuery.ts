import { IQuery } from '../../../../common/mediator/types.js';
import type { MatchSurfaceView, Page } from '../../common/views.js';

/** One page of the catalog (admin spec 003, US5). */
export class ListMatchSurfacesQuery extends IQuery<Page<MatchSurfaceView>> {
  constructor(
    readonly filters: { active?: boolean },
    readonly page: number,
    readonly pageSize: number,
  ) {
    super();
  }
}
