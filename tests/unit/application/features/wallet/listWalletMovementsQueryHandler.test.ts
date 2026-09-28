import { beforeEach, describe, expect, it } from 'vitest';
import { ListWalletMovementsQuery } from '../../../../../src/application/features/wallet/queries/listWalletMovements/listWalletMovementsQuery.js';
import { ListWalletMovementsQueryHandler } from '../../../../../src/application/features/wallet/queries/listWalletMovements/listWalletMovementsQueryHandler.js';
import { buildGoalkeeperProfile, COLOMBIA_INVOICING } from '../../../../fixtures/walletFixtures.js';
import { WalletHarness } from './walletHarness.js';

let h: WalletHarness;
let handler: ListWalletMovementsQueryHandler;

beforeEach(() => {
  h = new WalletHarness();
  h.profiles.seed(buildGoalkeeperProfile('gk-1'));
  handler = new ListWalletMovementsQueryHandler(h.profiles, h.store, h.store);
});

describe('ListWalletMovementsQueryHandler — US2: the goalkeeper sees their history', () => {
  it('pages 45 movements as 20, 20 and 5, newest first, each exactly once', async () => {
    for (let i = 0; i < 45; i++) await h.credit('gk-1', 1000);

    const pages = [];
    for (let page = 1; page <= 3; page++) pages.push(await handler.handle(new ListWalletMovementsQuery('gk-1', page, 20, 'goalkeeper')));

    const sequences = pages.flatMap((page) => (page.outcome === 'success' ? page.items.map((item) => item.sequence) : []));
    expect(pages.map((page) => page.outcome === 'success' && page.items.length)).toEqual([20, 20, 5]);
    expect(sequences).toEqual(Array.from({ length: 45 }, (_, index) => 45 - index));
    expect(pages[0]).toMatchObject({ totalItems: 45, totalPages: 3 });
  });

  it('hides actor, cause key and invoicing from the goalkeeper and shows them to an admin', async () => {
    await h.credit('gk-1', 20000);

    const own = await handler.handle(new ListWalletMovementsQuery('gk-1', 1, 20, 'goalkeeper'));
    const admin = await handler.handle(new ListWalletMovementsQuery('gk-1', 1, 20, 'admin'));

    expect(own.outcome === 'success' && own.items[0]).not.toHaveProperty('invoicing');
    expect(own.outcome === 'success' && own.items[0]).not.toHaveProperty('actor');
    expect(admin.outcome === 'success' && admin.items[0]).toMatchObject({
      actor: { kind: 'admin', userId: 'admin-1' },
      causeKey: expect.stringMatching(/^adjustment:/),
      invoicing: COLOMBIA_INVOICING,
    });
  });

  it('returns an empty page for a goalkeeper without movements', async () => {
    expect(await handler.handle(new ListWalletMovementsQuery('gk-1', 1, 20, 'goalkeeper'))).toEqual({
      outcome: 'success',
      items: [],
      page: 1,
      pageSize: 20,
      totalItems: 0,
      totalPages: 0,
    });
  });

  it('refuses a user who is not an active goalkeeper', async () => {
    expect(await handler.handle(new ListWalletMovementsQuery('someone', 1, 20, 'goalkeeper'))).toEqual({ outcome: 'not_a_goalkeeper' });
  });
});
