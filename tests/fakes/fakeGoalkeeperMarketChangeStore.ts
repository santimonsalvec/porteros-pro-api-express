import type { IGoalkeeperMarketChangeStore, MarketChangeStoreResult } from '../../src/application/features/goalkeepers/common/ports.js';
import type { FakeAccountClosureRepository } from './fakeAccountClosureRepository.js';
import type { FakeBookingRepository } from './fakeBookingRepository.js';
import type { FakeDepositRepository } from './fakeDepositRepository.js';
import type { FakeGoalkeeperProfileRepository } from './fakeGoalkeeperProfileRepository.js';
import type { FakeOperatingBalanceStore } from './fakeOperatingBalanceStore.js';

/**
 * In-memory market change (spec 031): it reads the same facts as the Mongo transaction and writes
 * nothing when told to fail after deciding, as an aborted transaction would.
 */
export class FakeGoalkeeperMarketChangeStore implements IGoalkeeperMarketChangeStore {
  /** Throws between the decision and the writes, to show nothing is left half done. */
  failBeforeWriting = false;

  constructor(
    private readonly deps: {
      profiles: FakeGoalkeeperProfileRepository;
      bookings: FakeBookingRepository;
      balances: FakeOperatingBalanceStore;
      deposits: FakeDepositRepository;
      closures: FakeAccountClosureRepository;
    },
  ) {}

  async changeMarket(args: Parameters<IGoalkeeperMarketChangeStore['changeMarket']>[0]): Promise<MarketChangeStoreResult> {
    const profile = await this.deps.profiles.getByUserId(args.userId);
    if (!profile) return { kind: 'not_a_goalkeeper' };
    const [balance, pending, closure] = await Promise.all([
      this.deps.balances.findByGoalkeeperId(args.userId),
      this.deps.deposits.findPendingForGoalkeeper(args.userId),
      this.deps.closures.findOpenByUserId(args.userId),
    ]);
    const refusal = args.decide({
      assignedBookingIds: this.deps.bookings
        .all()
        .filter((booking) => booking.goalkeeperId === args.userId && booking.status === 'assigned')
        .map((booking) => booking.id),
      balance: balance?.balance ?? null,
      currency: balance?.currency ?? null,
      pendingDepositId: pending[0]?.id ?? null,
      closureOpen: closure !== null,
    });
    if (refusal) return { kind: 'refused', refusal };
    if (this.failBeforeWriting) throw new Error('transaction aborted');

    const changed = await this.deps.profiles.applyMarketChange(args.userId, args.marketId, args.zoneIds, args.now);
    if (args.currency && balance) this.deps.balances.changeCurrency(args.userId, args.currency, args.now);
    return changed ? { kind: 'changed', profile: changed } : { kind: 'not_a_goalkeeper' };
  }
}
