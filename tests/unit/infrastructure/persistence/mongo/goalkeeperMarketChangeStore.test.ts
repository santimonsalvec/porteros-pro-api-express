import { describe, expect, it, vi } from 'vitest';
import type { ClientSession, Collection, Db, Document } from 'mongodb';
import { marketChangeRefusal } from '../../../../../src/domain/goalkeepers/marketChange.js';
import { MongoGoalkeeperMarketChangeStore } from '../../../../../src/infrastructure/persistence/mongo/goalkeeperMarketChangeStore.js';
import { createFakeCollection, toArrayCursor } from '../../../../fakes/fakeMongoCollection.js';
import { buildGoalkeeperProfile } from '../../../../fixtures/operatingBalanceFixtures.js';

const NOW = new Date('2026-10-15T12:00:00.000Z');
const ACROSS = { currentMarketId: 'med', currentCountryId: 'co', target: { id: 'gye', countryId: 'ec', status: 'enabled' as const } };

function harness(state: { balance?: Document | null; deposit?: Document | null; closure?: Document | null; held?: Document[]; profile?: boolean } = {}) {
  const profiles = createFakeCollection();
  const bookings = createFakeCollection();
  const operatingBalances = createFakeCollection();
  const deposits = createFakeCollection();
  const accountClosures = createFakeCollection();
  const collections: Record<string, unknown> = { goalkeeperProfiles: profiles, bookings, operatingBalances, deposits, accountClosures };
  const db = { collection: (name: string) => collections[name] as Collection<Document> } as unknown as Db;
  const session = {
    withTransaction: vi.fn(async (fn: () => Promise<unknown>, _options?: unknown) => fn()),
    endSession: vi.fn(async () => undefined),
  };
  profiles.findOne.mockResolvedValue(state.profile === false ? null : { _id: 'profile-gk-1' });
  profiles.updateOne.mockResolvedValue({});
  bookings.find.mockReturnValue(toArrayCursor(state.held ?? []));
  operatingBalances.findOne.mockResolvedValue(state.balance === undefined ? { _id: 'gk-1', balance: 0, currency: 'COP' } : state.balance);
  operatingBalances.updateOne.mockResolvedValue({});
  deposits.findOne.mockResolvedValue(state.deposit ?? null);
  accountClosures.findOne.mockResolvedValue(state.closure ?? null);
  const reader = { getByUserId: vi.fn(async () => buildGoalkeeperProfile('gk-1', { marketId: 'gye', zoneIds: ['z-gye'] })) };
  const store = new MongoGoalkeeperMarketChangeStore(() => session as unknown as ClientSession, db, reader);
  const change = (currency: string | null = 'USD') =>
    store.changeMarket({ userId: 'gk-1', marketId: 'gye', zoneIds: ['z-gye'], now: NOW, currency, decide: (facts) => marketChangeRefusal(ACROSS, facts) });
  return { profiles, bookings, operatingBalances, deposits, accountClosures, session, change };
}

describe('MongoGoalkeeperMarketChangeStore (spec 031, research §9)', () => {
  it('writes the profile and the new currency in one transaction', async () => {
    const h = harness();

    expect(await h.change()).toMatchObject({ kind: 'changed', profile: { marketId: 'gye' } });
    expect(h.session.withTransaction).toHaveBeenCalledTimes(1);
    expect(h.profiles.updateOne).toHaveBeenCalledWith(
      { userId: 'gk-1' },
      { $set: { marketId: 'gye', zoneIds: ['z-gye'], marketChangedAt: NOW } },
      expect.objectContaining({ session: expect.anything() }),
    );
    expect(h.operatingBalances.updateOne).toHaveBeenCalledWith({ _id: 'gk-1' }, { $set: { currency: 'USD', updatedAt: NOW } }, expect.anything());
    expect(h.session.endSession).toHaveBeenCalled();
  });

  it('reads the held bookings, the pending deposit and the open closure of the goalkeeper', async () => {
    const h = harness();
    await h.change();

    expect(h.bookings.find).toHaveBeenCalledWith({ goalkeeperId: 'gk-1', status: 'assigned' }, expect.anything());
    expect(h.deposits.findOne).toHaveBeenCalledWith({ goalkeeperId: 'gk-1', status: 'pending' }, expect.anything());
    expect(h.accountClosures.findOne).toHaveBeenCalledWith({ userId: 'gk-1', status: { $in: ['requested', 'refund_recorded'] } }, expect.anything());
  });

  it.each([
    [{ held: [{ _id: 'b-1' }] }, { kind: 'pending_bookings', bookingIds: ['b-1'] }],
    [{ balance: { _id: 'gk-1', balance: 500, currency: 'COP' } }, { kind: 'balance_not_zero', balance: 500, currency: 'COP' }],
    [{ deposit: { _id: 'd-1' } }, { kind: 'deposit_pending', depositId: 'd-1' }],
    [{ closure: { _id: 'cl-1' } }, { kind: 'account_closure_open' }],
  ])('refuses %o and writes nothing', async (state, refusal) => {
    const h = harness(state);

    expect(await h.change()).toEqual({ kind: 'refused', refusal });
    expect(h.profiles.updateOne).not.toHaveBeenCalled();
    expect(h.operatingBalances.updateOne).not.toHaveBeenCalled();
  });

  it('leaves the currency alone within the country, or without a balance', async () => {
    const within = harness();
    await within.change(null);
    const noBalance = harness({ balance: null });
    await noBalance.change();

    expect(within.operatingBalances.updateOne).not.toHaveBeenCalled();
    expect(noBalance.operatingBalances.updateOne).not.toHaveBeenCalled();
  });

  it('answers not_a_goalkeeper without a profile', async () => {
    expect(await harness({ profile: false }).change()).toEqual({ kind: 'not_a_goalkeeper' });
  });
});
