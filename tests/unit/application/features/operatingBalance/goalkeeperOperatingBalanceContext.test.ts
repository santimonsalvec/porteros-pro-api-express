import { beforeEach, describe, expect, it } from 'vitest';
import { resolveGoalkeeperOperatingBalanceContext } from '../../../../../src/application/features/operatingBalance/common/goalkeeperOperatingBalanceContext.js';
import { FakeMarketRepository } from '../../../../fakes/fakeMarketRepository.js';
import { FakeCountryRepository } from '../../../../fakes/fakeCountryRepository.js';
import { FakeGoalkeeperProfileRepository } from '../../../../fakes/fakeGoalkeeperProfileRepository.js';
import { FakeRegionRepository } from '../../../../fakes/fakeRegionRepository.js';
import { buildGoalkeeperProfile, COLOMBIA_INVOICING, seedOperatingBalanceWorld } from '../../../../fixtures/operatingBalanceFixtures.js';

let deps: {
  goalkeeperProfileRepository: FakeGoalkeeperProfileRepository;
  marketRepository: FakeMarketRepository;
  regionRepository: FakeRegionRepository;
  countryLookup: FakeCountryRepository;
};

beforeEach(() => {
  deps = {
    goalkeeperProfileRepository: new FakeGoalkeeperProfileRepository(),
    marketRepository: new FakeMarketRepository(),
    regionRepository: new FakeRegionRepository(),
    countryLookup: new FakeCountryRepository(),
  };
  seedOperatingBalanceWorld({ marketRepository: deps.marketRepository, countryRepository: deps.countryLookup });
});

describe('resolveGoalkeeperOperatingBalanceContext', () => {
  it("resolves an active goalkeeper's currency through city → region → country, with the invoicing snapshot", async () => {
    deps.goalkeeperProfileRepository.seed(buildGoalkeeperProfile('gk-1'));

    expect(await resolveGoalkeeperOperatingBalanceContext(deps, 'gk-1')).toMatchObject({
      kind: 'ok',
      currency: 'COP',
      countryId: 'country-co',
      invoicing: COLOMBIA_INVOICING,
    });
  });

  it('says not_a_goalkeeper when the user has no goalkeeper profile', async () => {
    expect(await resolveGoalkeeperOperatingBalanceContext(deps, 'someone')).toEqual({ kind: 'not_a_goalkeeper' });
  });

  it('reports operating_balance_not_configured when the country cannot be resolved', async () => {
    deps.goalkeeperProfileRepository.seed(buildGoalkeeperProfile('gk-2', { marketId: 'city-orphan' }));

    expect(await resolveGoalkeeperOperatingBalanceContext(deps, 'gk-2')).toEqual({ kind: 'operating_balance_not_configured', marketId: 'city-orphan' });
  });
});
