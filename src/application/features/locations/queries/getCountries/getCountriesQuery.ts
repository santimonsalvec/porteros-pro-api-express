import { IQuery } from '../../../../common/mediator/types.js';

export interface CountryOption {
  countryCode: string;
  name: string;
  dialCode: string;
}

export interface GetCountriesResult {
  countries: CountryOption[];
}

export class GetCountriesQuery extends IQuery<GetCountriesResult> {}
