import type {
  AcceptanceResult,
  IBookingAcceptanceStore,
} from '../../src/application/features/goalkeeperRequests/common/ports.js';
import { firstConflict, holdsSameRequest } from '../../src/domain/bookings/schedulePolicy.js';
import type { FakeBookingRepository } from './fakeBookingRepository.js';
import type { FakeOutboxStore } from './fakeOutboxStore.js';
import type { FakeWalletStore } from './fakeWalletStore.js';

type AcceptArgs = Parameters<IBookingAcceptanceStore['accept']>[0];

/**
 * In-memory acceptance applying the store's rules (research.md §3) atomically: claim only a
 * pending booking whose search is open and that is not the goalkeeper's own, check what they hold,
 * charge the commission — and restore the booking if any step refuses. Calls run one at a time,
 * standing in for the transaction's serialization on the goalkeeper's wallet document.
 */
export class FakeBookingAcceptanceStore implements IBookingAcceptanceStore {
  calls = 0;
  private forced: AcceptanceResult | Error | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly bookings: FakeBookingRepository,
    private readonly wallet: FakeWalletStore,
    private readonly outbox?: FakeOutboxStore,
  ) {}

  failNextWith(result: AcceptanceResult | Error): void {
    this.forced = result;
  }

  accept(args: AcceptArgs): Promise<AcceptanceResult> {
    const run = this.queue.then(() => this.acceptNow(args));
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async acceptNow(args: AcceptArgs): Promise<AcceptanceResult> {
    this.calls += 1;
    if (this.forced) {
      const forced = this.forced;
      this.forced = null;
      if (forced instanceof Error) throw forced;
      return forced;
    }

    const original = await this.bookings.findById(args.bookingId);
    if (
      !original ||
      original.status !== 'pending_assignment' ||
      !original.isSearchOpenAt(args.now) ||
      original.clientId === args.goalkeeperId
    ) {
      return { kind: 'not_claimed' };
    }

    const booking = original.assign(args.goalkeeperId, args.now);
    const held = (await this.bookings.findAssignedToGoalkeeper(args.goalkeeperId)).filter((other) => other.id !== booking.id);
    if (holdsSameRequest(booking, held)) return { kind: 'same_request' };
    const conflict = firstConflict(booking, held);
    if (conflict) return { kind: 'schedule_conflict', conflictingBookingId: conflict.id };

    const charge = await this.wallet.append(args.commissionDraft(booking));
    if (charge.kind === 'insufficient_funds') return { kind: 'insufficient_funds', balance: charge.balance };
    this.bookings.seed(booking);
    const event = args.event(booking);
    this.outbox?.append([event], args.now);
    return { kind: 'accepted', booking, event };
  }
}
