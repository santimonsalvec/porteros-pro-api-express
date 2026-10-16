import { describe, expect, it } from 'vitest';
import { usableSettings } from '../../../../../src/application/features/deposits/common/depositSetup.js';
import { FakePaymentGatewaySettingsRepository } from '../../../../fakes/fakePaymentGatewaySettingsRepository.js';

describe('usableSettings (spec 031, FR-032)', () => {
  it("takes the market's override first, then the country's", async () => {
    const repository = new FakePaymentGatewaySettingsRepository();
    repository.seed();
    repository.seed({ scope: 'market', refId: 'city-medellin', amounts: [50000] });

    const medellin = await usableSettings(repository, { countryId: 'country-co', marketId: 'city-medellin' }, 'COP');
    const cali = await usableSettings(repository, { countryId: 'country-co', marketId: 'city-cali' }, 'COP');

    expect([medellin?.scope, medellin?.amounts]).toEqual(['market', [50000]]);
    expect([cali?.scope, cali?.amounts]).toEqual(['country', [10000, 20000, 30000, 50000, 100000]]);
  });

  it('is none when the settings are in another currency than the operating balance', async () => {
    const repository = new FakePaymentGatewaySettingsRepository();
    repository.seed();
    expect(await usableSettings(repository, { countryId: 'country-co', marketId: 'city-cali' }, 'USD')).toBeNull();
  });
});
