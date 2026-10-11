import { IQuery } from '../../../../common/mediator/types.js';
import type { MatchSurfaceView } from '../../common/views.js';

export type GetMatchSurfaceResult = { outcome: 'ok'; surface: MatchSurfaceView } | { outcome: 'not_found' };

export class GetMatchSurfaceQuery extends IQuery<GetMatchSurfaceResult> {
  constructor(readonly surfaceId: string) {
    super();
  }
}
