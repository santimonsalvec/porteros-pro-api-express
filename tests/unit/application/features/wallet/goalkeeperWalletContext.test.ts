import { beforeEach, describe, expect, it } from 'vitest';
import { resolveGoalkeeperWalletContext } from '../../../../../src/application/features/wallet/common/goalkeeperWalletContext.js';
import { FakeCityRepository } from '../../../../fakes/fakeCityRepository.js';
import { FakeCountryRepository } from '../../../../fakes/fakeCountryRepository.js';
import { FakeGoalkeeperProfileRepository } from '../../../../fakes/fakeGoalkeeperProfileRepository.js';
import { FakeRegionRepository } from '../../../../fakes/fakeRegionRepository.js';
import { buildGoalkeeperProfile, COLOMBIA_INVOICING, seedWalletWorld } from '../../../../fixtures/walletFixtures.js';

let deps: {
  goalkeeperProfileRepository: FakeGoalkeeperProfileRepository;
  cityRepository: FakeCityRepository;
  regionRepository: FakeRegionRepository;
  countryLookup: FakeCountryRepository;
};

beforeEach(() => {
  deps = {
    goalkeeperProfileRepository: new FakeGoalkeeperProfileRepository(),
    cityRepository: new FakeCityRepository(),
    regionRepository: new FakeRegionRepository(),
    countryLookup: new FakeCountryRepository(),
  };
  seedWalletWorld({ cityRepository: deps.cityRepository, regionRepository: deps.regionRepository, countryRepository: deps.countryLookup });
});

describe('resolveGoalkeeperWalletContext', () => {
  it("resolves an active goalkeeper's currency through city → region → country, with the invoicing snapshot", async () => {
    deps.goalkeeperProfileRepository.seed(buildGoalkeeperProfile('gk-1'));

    expect(await resolveGoalkeeperWalletContext(deps, 'gk-1')).toMatchObject({
      kind: 'ok',
      currency: 'COP',
      countryId: 'country-co',
      invoicing: COLOMBIA_INVOICING,
    });
  });

  it('says not_a_goalkeeper when the user has no goalkeeper profile', async () => {
    expect(await resolveGoalkeeperWalletContext(deps, 'someone')).toEqual({ kind: 'not_a_goalkeeper' });
  });

  it('reports wallet_not_configured when the country cannot be resolved', async () => {
    deps.goalkeeperProfileRepository.seed(buildGoalkeeperProfile('gk-2', { cityId: 'city-orphan' }));

    expect(await resolveGoalkeeperWalletContext(deps, 'gk-2')).toEqual({ kind: 'wallet_not_configured', cityId: 'city-orphan' });
  });
});
