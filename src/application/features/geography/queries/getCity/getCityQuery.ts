import { IQuery } from '../../../../common/mediator/types.js';
import type { CityView } from '../../common/views.js';

export type GetCityResult = { outcome: 'ok'; city: CityView } | { outcome: 'not_found' };

export class GetCityQuery extends IQuery<GetCityResult> {
  constructor(readonly cityId: string) {
    super();
  }
}
