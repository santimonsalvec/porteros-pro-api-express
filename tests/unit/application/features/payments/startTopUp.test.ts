import { describe, expect, it } from 'vitest';
import { StartTopUpCommand } from '../../../../../src/application/features/payments/commands/startTopUp/startTopUpCommand.js';
import { GetTopUpOptionsQuery } from '../../../../../src/application/features/payments/queries/getTopUpOptions/getTopUpOptionsQuery.js';
import { sha256Hex } from '../../../../../src/infrastructure/payments/wompiGateway.js';
import { TEST_GATEWAY_SECRETS } from '../../../../fakes/fakePaymentSecrets.js';
import { buildGoalkeeperProfile } from '../../../../fixtures/walletFixtures.js';
import { PaymentsHarness, PUBLIC_BASE_URL, TERMS_VERSION } from './paymentsHarness.js';

describe('GetTopUpOptionsQueryHandler', () => {
  it('offers each amount with its cost and net, and whether the current terms are accepted', async () => {
    const harness = new PaymentsHarness();
    harness.goalkeeper();

    const result = await harness.optionsHandler().handle(new GetTopUpOptionsQuery('gk-1'));

    expect(result).toEqual({
      outcome: 'ok',
      available: true,
      gateway: 'wompi',
      currency: 'COP',
      termsAccepted: true,
      termsVersion: TERMS_VERSION,
      options: [
        { amount: 10000, cost: 1149, net: 8851 },
        { amount: 20000, cost: 1464, net: 18536 },
        { amount: 30000, cost: 1780, net: 28220 },
        { amount: 50000, cost: 2410, net: 47590 },
        { amount: 100000, cost: 3987, net: 96013 },
      ],
    });
  });

  it('reports top-ups unavailable in a country without a gateway', async () => {
    const harness = new PaymentsHarness();
    harness.goalkeeper();
    harness.settings.clear();

    expect(await harness.optionsHandler().handle(new GetTopUpOptionsQuery('gk-1'))).toMatchObject({ available: false, gateway: null, options: [] });
  });

  it('reports terms accepted only in the current version', async () => {
    const harness = new PaymentsHarness();
    harness.goalkeeper('gk-1', { acceptedVersion: '1.0' });

    expect(await harness.optionsHandler().handle(new GetTopUpOptionsQuery('gk-1'))).toMatchObject({ termsAccepted: false });
  });

  it('refuses a user who is not a goalkeeper, and a wallet without a currency', async () => {
    const harness = new PaymentsHarness();
    harness.wallet.profiles.seed(buildGoalkeeperProfile('gk-orphan', { cityId: 'city-orphan' }));

    expect(await harness.optionsHandler().handle(new GetTopUpOptionsQuery('nobody'))).toEqual({ outcome: 'not_a_goalkeeper' });
    expect(await harness.optionsHandler().handle(new GetTopUpOptionsQuery('gk-orphan'))).toEqual({
      outcome: 'wallet_not_configured',
      cityId: 'city-orphan',
    });
  });
});

describe('StartTopUpCommandHandler', () => {
  it('creates a pending top-up with the country\'s gateway and answers a signed checkout address', async () => {
    const harness = new PaymentsHarness();
    harness.goalkeeper();

    const result = await harness.start('gk-1', 20000);

    const stored = harness.topUps.all();
    expect(stored).toHaveLength(1);
    const topUp = stored[0]!;
    expect(topUp).toMatchObject({
      goalkeeperId: 'gk-1',
      countryId: 'country-co',
      gateway: 'wompi',
      status: 'pending',
      amount: 20000,
      cost: 1464,
      net: 18536,
      currency: 'COP',
    });
    expect(topUp.reference).toMatch(/^PPR-[0-9a-f]{32}$/);
    expect(topUp.nextCheckAt).toEqual(new Date(harness.clock.now().getTime() + 15 * 60_000));
    expect(result.topUp).toEqual({
      topUpId: topUp.id,
      reference: topUp.reference,
      status: 'pending',
      amount: 20000,
      cost: 1464,
      net: 18536,
      currency: 'COP',
      createdAt: harness.clock.now().toISOString(),
      finalizedAt: null,
    });

    const url = new URL(result.checkoutUrl);
    expect(`${url.origin}${url.pathname}`).toBe('https://checkout.wompi.co/p/');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      'public-key': 'pub_test_fake-public-key',
      currency: 'COP',
      'amount-in-cents': '2000000',
      reference: topUp.reference,
      'signature:integrity': sha256Hex(`${topUp.reference}2000000COP${TEST_GATEWAY_SECRETS.integritySecret}`),
      'redirect-url': `${PUBLIC_BASE_URL}/pagos/retorno/${topUp.reference}`,
    });
  });

  it('never exposes or logs a secret', async () => {
    const harness = new PaymentsHarness();
    harness.goalkeeper();

    const result = await harness.start();
    harness.secrets.secrets.clear();
    await harness.startHandler().handle(new StartTopUpCommand('gk-1', 20000));

    const everything = JSON.stringify({ result, logs: harness.logger.entries, stored: harness.topUps.all().map((t) => t.toProps()) });
    for (const secret of Object.values(TEST_GATEWAY_SECRETS)) expect(everything).not.toContain(secret);
  });

  it.each([15000, 0, -20000])('refuses %i, which is not one of the amounts', async (amount) => {
    const harness = new PaymentsHarness();
    harness.goalkeeper();

    expect(await harness.startHandler().handle(new StartTopUpCommand('gk-1', amount))).toEqual({
      outcome: 'invalid_amount',
      amounts: [10000, 20000, 30000, 50000, 100000],
    });
    expect(harness.topUps.all()).toEqual([]);
  });

  it.each<[string, string | null]>([
    ['never accepted', null],
    ['accepted an older version', '1.0'],
  ])('refuses a goalkeeper who %s the terms', async (_label, acceptedVersion) => {
    const harness = new PaymentsHarness();
    harness.goalkeeper('gk-1', { acceptedVersion });

    expect(await harness.startHandler().handle(new StartTopUpCommand('gk-1', 20000))).toEqual({
      outcome: 'terms_not_accepted',
      termsVersion: TERMS_VERSION,
    });
    expect(harness.topUps.all()).toEqual([]);
  });

  it('refuses in a country without a gateway', async () => {
    const harness = new PaymentsHarness();
    harness.goalkeeper();
    harness.settings.clear();

    expect(await harness.startHandler().handle(new StartTopUpCommand('gk-1', 20000))).toEqual({ outcome: 'top_ups_unavailable' });
  });

  it('refuses when settings are in another currency than the wallet', async () => {
    const harness = new PaymentsHarness();
    harness.goalkeeper();
    harness.settings.seed({ currency: 'USD' });

    expect(await harness.startHandler().handle(new StartTopUpCommand('gk-1', 20000))).toEqual({ outcome: 'top_ups_unavailable' });
  });

  it('answers gateway unavailable without the secrets, and says which part is missing', async () => {
    const harness = new PaymentsHarness();
    harness.goalkeeper();
    harness.secrets.secrets.clear();

    expect(await harness.startHandler().handle(new StartTopUpCommand('gk-1', 20000))).toEqual({ outcome: 'gateway_unavailable' });
    expect(harness.topUps.all()).toEqual([]);
    expect(harness.logger.entries).toContainEqual(
      expect.objectContaining({ level: 'warn', entry: expect.objectContaining({ secretsPresent: false, gatewaySupported: true }) }),
    );
  });

  it('answers gateway unavailable without a public base address to return to', async () => {
    const harness = new PaymentsHarness();
    harness.goalkeeper();

    expect(await harness.startHandler('').handle(new StartTopUpCommand('gk-1', 20000))).toEqual({ outcome: 'gateway_unavailable' });
  });

  it('refuses a user who is not a goalkeeper', async () => {
    const harness = new PaymentsHarness();

    expect(await harness.startHandler().handle(new StartTopUpCommand('nobody', 20000))).toEqual({ outcome: 'not_a_goalkeeper' });
  });
});
