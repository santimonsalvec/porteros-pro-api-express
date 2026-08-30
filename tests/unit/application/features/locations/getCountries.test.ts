import { describe, expect, it } from 'vitest';
import { GetCountriesQuery } from '../../../../../src/application/features/locations/queries/getCountries/getCountriesQuery.js';
import { GetCountriesQueryHandler } from '../../../../../src/application/features/locations/queries/getCountries/getCountriesQueryHandler.js';
import { FakeCountryRepository } from '../../../../fakes/fakeCountryRepository.js';
import { Country } from '../../../../../src/domain/countries/country.js';

describe('GetCountriesQueryHandler', () => {
  it('projects every country from the repository', async () => {
    const countryRepository = new FakeCountryRepository();
    countryRepository.seed(new Country({ id: 'c1', name: 'Colombia', dialCode: '+57', countryCode: 'CO' }));
    countryRepository.seed(new Country({ id: 'c2', name: 'United States', dialCode: '+1', countryCode: 'US' }));
    const handler = new GetCountriesQueryHandler(countryRepository);

    const result = await handler.handle(new GetCountriesQuery());

    expect(result.countries).toEqual(
      expect.arrayContaining([
        { countryCode: 'CO', name: 'Colombia', dialCode: '+57' },
        { countryCode: 'US', name: 'United States', dialCode: '+1' },
      ]),
    );
  });
});
