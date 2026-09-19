import { IQuery } from '../../../../common/mediator/types.js';

export interface CityOption {
  id: string;
  name: string;
  region: string;
  hasZones: boolean;
}

export interface GetCitiesResult {
  cities: CityOption[];
}

export class GetCitiesQuery extends IQuery<GetCitiesResult> {
  constructor(public readonly q: string) {
    super();
  }
}
