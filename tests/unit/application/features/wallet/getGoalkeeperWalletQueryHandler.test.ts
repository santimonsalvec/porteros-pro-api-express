import { beforeEach, describe, expect, it } from 'vitest';
import { GetGoalkeeperWalletQuery } from '../../../../../src/application/features/wallet/queries/getGoalkeeperWallet/getGoalkeeperWalletQuery.js';
import { GetGoalkeeperWalletQueryHandler } from '../../../../../src/application/features/wallet/queries/getGoalkeeperWallet/getGoalkeeperWalletQueryHandler.js';
import { buildGoalkeeperProfile } from '../../../../fixtures/walletFixtures.js';
import { WalletHarness } from './walletHarness.js';
import { fixedVatRates } from '../../../../fakes/fakeVatRates.js';

let h: WalletHarness;
let handler: GetGoalkeeperWalletQueryHandler;

beforeEach(() => {
  h = new WalletHarness();
  handler = new GetGoalkeeperWalletQueryHandler(h.context, h.store, h.resolver, h.clock, fixedVatRates(0));
});

const get = (goalkeeperId = 'gk-1') => handler.handle(new GetGoalkeeperWalletQuery(goalkeeperId));

describe('GetGoalkeeperWalletQueryHandler — US2: the goalkeeper sees their balance', () => {
  it('shows balance, currency, movement count and that offers are visible', async () => {
    h.profiles.seed(buildGoalkeeperProfile('gk-1', { zoneIds: ['zone-cali-norte', 'zone-cali-sur'] }));
    await h.credit('gk-1', 20000);
    await h.ledger.chargeCommission(h.owner('gk-1'), { bookingId: 'b-1', requestId: 'r-1', amount: 7000 });

    expect(await get()).toEqual({
      outcome: 'success',
      wallet: {
        balance: 13000,
        currency: 'COP',
        offers: { canSeeOffers: true, lowestCommission: 7000, lowestCharge: 7000, vatRateBps: 0, missingAmount: 0 },
        movementCount: 2,
      },
      unconfiguredZoneIds: [],
    });
  });

  it('counts the VAT on top of the commission (feature 023)', async () => {
    h.profiles.seed(buildGoalkeeperProfile('gk-1', { zoneIds: ['zone-cali-norte'] }));
    await h.credit('gk-1', 7500);
    const withVat = new GetGoalkeeperWalletQueryHandler(h.context, h.store, h.resolver, h.clock, fixedVatRates(1900));

    expect(await withVat.handle(new GetGoalkeeperWalletQuery('gk-1'))).toMatchObject({
      wallet: { offers: { canSeeOffers: false, lowestCommission: 7000, lowestCharge: 8330, vatRateBps: 1900, missingAmount: 830 } },
    });
  });

  it('shows an empty wallet (balance 0, no movements) before any movement, and how much is missing', async () => {
    h.profiles.seed(buildGoalkeeperProfile('gk-1', { zoneIds: ['zone-cali-sur'] }));

    expect(await get()).toMatchObject({
      outcome: 'success',
      wallet: { balance: 0, currency: 'COP', offers: { canSeeOffers: false, lowestCommission: 9000, missingAmount: 9000 }, movementCount: 0 },
    });
  });

  it('reports enabled zones that have no commission configured', async () => {
    h.profiles.seed(buildGoalkeeperProfile('gk-1', { zoneIds: ['zone-cali-norte', 'zone-deleted'] }));

    expect(await get()).toMatchObject({ outcome: 'success', unconfiguredZoneIds: ['zone-deleted'] });
  });

  it('refuses a user who is not an active goalkeeper', async () => {
    expect(await get('someone')).toEqual({ outcome: 'not_a_goalkeeper' });
  });

  it("reports wallet_not_configured when the goalkeeper's country cannot be resolved", async () => {
    h.profiles.seed(buildGoalkeeperProfile('gk-1', { cityId: 'city-orphan' }));

    expect(await get()).toEqual({ outcome: 'wallet_not_configured', cityId: 'city-orphan' });
  });
});
