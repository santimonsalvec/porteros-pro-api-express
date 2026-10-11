import { IQuery } from '../../../../common/mediator/types.js';
import type { RegionView } from '../../common/views.js';

export type GetRegionResult = { outcome: 'ok'; region: RegionView } | { outcome: 'not_found' };

export class GetRegionQuery extends IQuery<GetRegionResult> {
  constructor(readonly regionId: string) {
    super();
  }
}
