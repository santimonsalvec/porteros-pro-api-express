import type { CountryOption } from '../../../application/features/locations/queries/getCountries/getCountriesQuery.js';

export interface CountriesResponse {
  countries: CountryOption[];
}
