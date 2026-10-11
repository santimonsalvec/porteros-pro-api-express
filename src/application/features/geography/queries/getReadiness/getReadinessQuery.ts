import { IQuery } from '../../../../common/mediator/types.js';
import type { ReadinessItem } from '../../common/readiness.js';
import type { CityState } from '../../common/views.js';

export interface CountryReadinessView {
  countryId: string;
  name: string;
  ready: boolean;
  items: ReadinessItem[];
}

export interface CountryDashboard {
  country: CountryReadinessView;
  /** Only the operating cities: most cities of a country are loaded in bulk and never opened. */
  cities: { cityId: string; name: string; regionName: string; ready: boolean; missingCount: number }[];
  availableCityCount: number;
}

export interface CityReadinessView {
  cityId: string;
  name: string;
  state: CityState;
  ready: boolean;
  missingCount: number;
  items: ReadinessItem[];
  country: CountryReadinessView | null;
}

export type GetReadinessResult =
  | { outcome: 'country'; dashboard: CountryDashboard }
  | { outcome: 'city'; readiness: CityReadinessView }
  | { outcome: 'country_not_found' }
  | { outcome: 'city_not_found' };

/** What a country or a city still needs to quote (admin spec 003, US3, `GET /admin/readiness`). */
export class GetReadinessQuery extends IQuery<GetReadinessResult> {
  /** Use `ofCountry` or `ofCity`. */
  constructor(
    readonly countryId: string | null,
    readonly cityId: string | null,
  ) {
    super();
  }

  static ofCountry(countryId: string): GetReadinessQuery {
    return new GetReadinessQuery(countryId, null);
  }

  static ofCity(cityId: string): GetReadinessQuery {
    return new GetReadinessQuery(null, cityId);
  }
}
