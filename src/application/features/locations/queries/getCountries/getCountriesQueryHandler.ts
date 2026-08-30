import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { ICountryRepository } from '../../../profile/common/ports.js';
import { GetCountriesQuery, type GetCountriesResult } from './getCountriesQuery.js';

export class GetCountriesQueryHandler implements IQueryHandler<GetCountriesQuery, GetCountriesResult> {
  constructor(private readonly countryRepository: ICountryRepository) {}

  async handle(_query: GetCountriesQuery): Promise<GetCountriesResult> {
    const countries = await this.countryRepository.getAll();
    return {
      countries: countries.map((country) => ({
        countryCode: country.countryCode,
        name: country.name,
        dialCode: country.dialCode,
      })),
    };
  }
}
