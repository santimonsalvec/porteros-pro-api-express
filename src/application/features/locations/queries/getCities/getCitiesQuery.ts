import { IQuery } from '../../../../common/mediator/types.js';

/** A municipality the goalkeeper can say they live in (billing, spec 031 §A3). */
export interface CityOption {
  id: string;
  name: string;
  /** The department's name; empty when the region is not recorded. */
  stateName: string;
}

export interface GetCitiesResult {
  cities: CityOption[];
}

export class GetCitiesQuery extends IQuery<GetCitiesResult> {
  constructor(public readonly q: string) {
    super();
  }
}
