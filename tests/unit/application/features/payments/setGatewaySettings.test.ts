import { describe, expect, it } from 'vitest';
import { SetGatewaySettingsCommand } from '../../../../../src/application/features/payments/commands/setGatewaySettings/setGatewaySettingsCommand.js';
import { SetGatewaySettingsCommandHandler } from '../../../../../src/application/features/payments/commands/setGatewaySettings/setGatewaySettingsCommandHandler.js';
import { GetGatewaySettingsQuery } from '../../../../../src/application/features/payments/queries/getGatewaySettings/getGatewaySettingsQuery.js';
import { GetGatewaySettingsQueryHandler } from '../../../../../src/application/features/payments/queries/getGatewaySettings/getGatewaySettingsQueryHandler.js';
import { Country } from '../../../../../src/domain/countries/country.js';
import { PaymentsHarness } from './paymentsHarness.js';

const COSTS = { percentBps: 265, fixed: 700, vatBps: 1900 };
const SANDBOX = { publicKey: 'pub_test_new', environment: 'sandbox' as const };

function setter(harness: PaymentsHarness) {
  return new SetGatewaySettingsCommandHandler(harness.operatingBalance.countries, harness.settings, harness.secrets, harness.clock, harness.logger);
}

describe('SetGatewaySettingsCommandHandler', () => {
  it('saves a country\'s settings in its currency and reads them back', async () => {
    const harness = new PaymentsHarness();
    harness.settings.clear();

    const result = await setter(harness).handle(new SetGatewaySettingsCommand('admin-1', 'country-co', 'wompi', SANDBOX, COSTS, [50000, 20000], null));

    expect(result).toMatchObject({
      outcome: 'saved',
      settings: {
        countryId: 'country-co',
        gateway: 'wompi',
        currency: 'COP',
        amounts: [20000, 50000],
        options: [
          { amount: 20000, cost: 1464, net: 18536 },
          { amount: 50000, cost: 2410, net: 47590 },
        ],
        updatedBy: 'admin-1',
        updatedAt: harness.clock.now().toISOString(),
      },
    });
    expect(await new GetGatewaySettingsQueryHandler(harness.settings, harness.secrets, harness.operatingBalance.countries).handle(new GetGatewaySettingsQuery('country-co'))).toMatchObject({
      outcome: 'success',
      settings: { publicConfig: SANDBOX },
    });
  });

  it.each<[string, SetGatewaySettingsCommand, string]>([
    ['an unsupported gateway', new SetGatewaySettingsCommand('admin-1', 'country-co', 'stripe', SANDBOX, COSTS, [20000], 0), 'gateway'],
    ['a production key in sandbox', new SetGatewaySettingsCommand('admin-1', 'country-co', 'wompi', { publicKey: 'pub_prod_x', environment: 'sandbox' }, COSTS, [20000], 0), 'publicConfig.publicKey'],
    ['repeated amounts', new SetGatewaySettingsCommand('admin-1', 'country-co', 'wompi', SANDBOX, COSTS, [20000, 20000], 0), 'amounts'],
    ['an amount the cost eats', new SetGatewaySettingsCommand('admin-1', 'country-co', 'wompi', SANDBOX, COSTS, [500], 0), 'amounts'],
    ['a negative fixed cost', new SetGatewaySettingsCommand('admin-1', 'country-co', 'wompi', SANDBOX, { ...COSTS, fixed: -1 }, [20000], 0), 'costs'],
  ])('refuses %s, naming the field', async (_label, command, field) => {
    const harness = new PaymentsHarness();

    const result = await setter(harness).handle(command);

    expect(result.outcome).toBe('invalid');
    if (result.outcome === 'invalid') expect(Object.keys(result.fieldErrors)).toContain(field);
    expect((await harness.settings.getByCountry('country-co'))?.publicConfig.publicKey).toBe('pub_test_fake-public-key');
  });

  it('refuses an unknown country, and a country without a currency', async () => {
    const harness = new PaymentsHarness();
    harness.operatingBalance.countries.seed(new Country({ id: 'country-xx', name: 'Sin moneda', dialCode: '+0', countryCode: 'XX' }));

    expect(await setter(harness).handle(new SetGatewaySettingsCommand('admin-1', 'nowhere', 'wompi', SANDBOX, COSTS, [20000], 0))).toEqual({
      outcome: 'country_not_found',
    });
    expect(await setter(harness).handle(new SetGatewaySettingsCommand('admin-1', 'country-xx', 'wompi', SANDBOX, COSTS, [20000], 0))).toMatchObject({
      outcome: 'invalid',
      fieldErrors: { currency: expect.any(String) },
    });
  });

  it('leaves a pending deposit on the gateway and environment it started with', async () => {
    const harness = new PaymentsHarness();
    harness.goalkeeper();
    const { deposit } = await harness.start();

    await setter(harness).handle(
      new SetGatewaySettingsCommand('admin-1', 'country-co', 'wompi', { publicKey: 'pub_prod_live', environment: 'production' }, COSTS, [30000], 0),
    );

    expect(await harness.deposits.getById(deposit.depositId)).toMatchObject({ gateway: 'wompi', environment: 'sandbox', status: 'pending', amount: 20000 });
    expect(await harness.deliver(harness.event(deposit.reference, 'APPROVED'))).toEqual({ outcome: 'applied' });
  });
});

describe('SetGatewaySettingsCommandHandler revision (admin spec 007, FR-025)', () => {
  const save = (harness: PaymentsHarness, revision: number | null) =>
    setter(harness).handle(new SetGatewaySettingsCommand('admin-1', 'country-co', 'wompi', SANDBOX, COSTS, [20000], revision));

  it('creates at revision 0 and moves up one with each save', async () => {
    const harness = new PaymentsHarness();
    harness.settings.clear();

    expect(await save(harness, null)).toMatchObject({ outcome: 'saved', settings: { revision: 0 } });
    expect(await save(harness, 0)).toMatchObject({ outcome: 'saved', settings: { revision: 1 } });
  });

  it('refuses an old revision, and a create over settings that exist, changing nothing', async () => {
    const harness = new PaymentsHarness();
    await save(harness, 0);

    expect(await save(harness, 0)).toEqual({ outcome: 'stale' });
    expect(await save(harness, null)).toEqual({ outcome: 'stale' });
    expect((await harness.settings.getByCountry('country-co'))?.revision).toBe(1);
  });

  it("says whether the country's secrets are loaded, never their values", async () => {
    const harness = new PaymentsHarness();
    const loaded = await save(harness, 0);
    harness.secrets.secrets.clear();
    const missing = await new GetGatewaySettingsQueryHandler(harness.settings, harness.secrets, harness.operatingBalance.countries).handle(new GetGatewaySettingsQuery('country-co'));

    expect(loaded).toMatchObject({ settings: { credentialsPresent: true } });
    expect(missing).toMatchObject({ settings: { credentialsPresent: false, revision: 1 } });
    expect(JSON.stringify(loaded)).not.toMatch(/prv_|events|integrity/);
  });
});

describe('GetGatewaySettingsQueryHandler', () => {
  it('answers not found for a country without settings', async () => {
    const harness = new PaymentsHarness();

    expect(await new GetGatewaySettingsQueryHandler(harness.settings, harness.secrets, harness.operatingBalance.countries).handle(new GetGatewaySettingsQuery('country-mx'))).toEqual({ outcome: 'not_found' });
  });
});
