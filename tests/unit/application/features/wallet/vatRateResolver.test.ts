import { describe, expect, it } from 'vitest';
import { createVatRateResolver } from '../../../../../src/application/features/wallet/common/vatRateResolver.js';
import { TaxSetting } from '../../../../../src/domain/wallet/taxSetting.js';
import { InvalidConfigurationError } from '../../../../../src/domain/pricing/invalidConfigurationError.js';
import { FakeTaxSettingsRepository } from '../../../../fakes/fakeTaxSettingsRepository.js';
import { FakeCityRepository } from '../../../../fakes/fakeCityRepository.js';
import { FakeCountryRepository } from '../../../../fakes/fakeCountryRepository.js';
import { FakeRegionRepository } from '../../../../fakes/fakeRegionRepository.js';
import { seedWalletWorld } from '../../../../fixtures/walletFixtures.js';

function locations() {
  const cityRepository = new FakeCityRepository();
  const regionRepository = new FakeRegionRepository();
  seedWalletWorld({ cityRepository, regionRepository, countryRepository: new FakeCountryRepository() });
  return { cityRepository, regionRepository };
}

describe('createVatRateResolver', () => {
  it('answers the country\'s rate, and 0 with a warning when none is configured', async () => {
    const repository = new FakeTaxSettingsRepository();
    repository.seed('country-co', 1900);
    const warnings: unknown[] = [];
    const resolver = createVatRateResolver(repository, locations(), { warn: (entry) => void warnings.push(entry) });

    expect(await resolver.forCountry('country-co')).toBe(1900);
    expect(await resolver.forCity('city-cali')).toBe(1900);
    expect(await resolver.forCity('city-orphan')).toBe(0);
    expect(await resolver.forCountry('country-mx')).toBe(0);
    expect(warnings).toEqual([{ outcome: 'vat_not_configured', countryId: 'country-mx' }]);
  });
});

describe('TaxSetting', () => {
  const props = { countryId: 'country-co', vatRateBps: 1900, updatedAt: new Date(), updatedBy: 'admin-1' };

  it.each([-1, 10001, 19.5])('refuses a rate of %s', (vatRateBps) => {
    expect(TaxSetting.create({ ...props, vatRateBps }).ok).toBe(false);
    expect(() => TaxSetting.rehydrate({ ...props, vatRateBps })).toThrow(InvalidConfigurationError);
  });

  it('accepts 0 % to 100 %', () => {
    expect(TaxSetting.create({ ...props, vatRateBps: 0 }).ok).toBe(true);
    expect(TaxSetting.create({ ...props, vatRateBps: 10000 }).ok).toBe(true);
  });
});
