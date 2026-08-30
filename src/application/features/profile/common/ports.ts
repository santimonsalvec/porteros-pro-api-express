import type { IRepository } from '../../../common/persistence/repository.js';
import type { Country } from '../../../../domain/countries/country.js';
import type { TermsAcceptance } from '../../../../domain/users/termsAcceptance.js';

export interface ICountryRepository extends IRepository<Country, string> {
  findByCountryCode(countryCode: string): Promise<Country | null>;
}

export type ITermsAcceptanceRepository = IRepository<TermsAcceptance, string>;
