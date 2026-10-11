import { IQuery } from '../../../../common/mediator/types.js';
import type { CountryView } from '../../common/views.js';

export type GetCountryResult = { outcome: 'ok'; country: CountryView } | { outcome: 'not_found' };

export class GetCountryQuery extends IQuery<GetCountryResult> {
  constructor(readonly countryId: string) {
    super();
  }
}
