import { ClientOutcomeNoticeHandler } from '../../../../../src/application/features/bookingLifecycle/handlers/clientOutcomeNoticeHandler.js';
import { BookingExpiryJob } from '../../../../../src/application/features/bookingLifecycle/jobs/bookingExpiryJob.js';
import type { IEventRelay } from '../../../../../src/application/features/events/common/ports.js';
import type { Booking } from '../../../../../src/domain/bookings/booking.js';
import { Booking as BookingEntity } from '../../../../../src/domain/bookings/booking.js';
import type { DomainEvent } from '../../../../../src/domain/events/domainEvent.js';
import { FakeBookingLifecycleStore } from '../../../../fakes/fakeBookingLifecycleStore.js';
import { FakeOutboxStore } from '../../../../fakes/fakeOutboxStore.js';
import { FakeProcessedEventStore } from '../../../../fakes/fakeProcessedEventStore.js';
import { FakeWalletStore } from '../../../../fakes/fakeWalletStore.js';
import { offerHarness } from '../notifications/offerHarness.js';
import { CancelAllJob } from '../../../../../src/application/features/bookingLifecycle/jobs/cancelAllJob.js';
import { GoalkeeperCancellationNoticeHandler } from '../../../../../src/application/features/bookingLifecycle/handlers/goalkeeperCancellationNoticeHandler.js';
import { WalletLedger, type LedgerOwner } from '../../../../../src/application/features/wallet/common/walletLedger.js';
import { FakeCountryRepository } from '../../../../fakes/fakeCountryRepository.js';
import { FakeRegionRepository } from '../../../../fakes/fakeRegionRepository.js';
import { buildGoalkeeperProfile, COLOMBIA_INVOICING, seedWalletWorld } from '../../../../fixtures/walletFixtures.js';

/**
 * 015's offer harness (requests in Bello, inbox, push) plus the lifecycle store over fakes, a
 * relay that just records what it published, and the client outcome consumer.
 */
export function lifecycleHarness() {
  const h = offerHarness();
  const wallet = new FakeWalletStore(() => h.clock.now());
  const outbox = new FakeOutboxStore();
  const store = new FakeBookingLifecycleStore(h.bookingRepository, h.requestRepository, wallet, outbox);
  const relayed: DomainEvent[] = [];
  const relay: IEventRelay = { relay: async (events) => void relayed.push(...events) };
  let counter = 0;
  const idGenerator = { newId: () => `0192a3b4-1111-7000-8000-${String(++counter).padStart(12, '0')}` };
  const expiryJob = new BookingExpiryJob({ bookingRepository: h.bookingRepository, store, relay, idGenerator, logger: h.silent });
  const clientNotices = new ClientOutcomeNoticeHandler({
    requestRepository: h.requestRepository,
    bookingRepository: h.bookingRepository,
    zoneRepository: h.zoneRepository,
    cityRepository: h.cityRepository,
    notifications: h.notifications,
    pushNotifier: h.pushNotifier,
    processed: new FakeProcessedEventStore(),
    idGenerator,
    clock: h.clock,
    logger: h.silent,
  });
  // Wallets: goalkeepers live in Cali (Colombia, COP), so their ledger owner resolves.
  const regionRepository = new FakeRegionRepository();
  const countryRepository = new FakeCountryRepository();
  seedWalletWorld({ cityRepository: h.cityRepository, regionRepository, countryRepository });
  const walletContext = { goalkeeperProfileRepository: h.goalkeeperProfileRepository, cityRepository: h.cityRepository, regionRepository, countryLookup: countryRepository };
  const ledger = new WalletLedger(wallet, wallet, idGenerator, h.clock);
  const owner = (goalkeeperId: string): LedgerOwner => ({ goalkeeperId, currency: 'COP', invoicing: COLOMBIA_INVOICING });
  const cancelAllJob = new CancelAllJob({
    requestRepository: h.requestRepository,
    bookingRepository: h.bookingRepository,
    store,
    walletContext,
    relay,
    idGenerator,
    logger: h.silent,
  });
  const goalkeeperNotices = new GoalkeeperCancellationNoticeHandler({
    requestRepository: h.requestRepository,
    zoneRepository: h.zoneRepository,
    cityRepository: h.cityRepository,
    notifications: h.notifications,
    pushNotifier: h.pushNotifier,
    processed: new FakeProcessedEventStore(),
    idGenerator,
    clock: h.clock,
    logger: h.silent,
  });
  /** A funded goalkeeper who accepted this booking and paid its commission. */
  const acceptAndPay = async (booking: Booking, goalkeeperId: string) => {
    if (!(await h.goalkeeperProfileRepository.getByUserId(goalkeeperId))) {
      h.goalkeeperProfileRepository.seed(buildGoalkeeperProfile(goalkeeperId));
      await ledger.adjust(owner(goalkeeperId), { adminUserId: 'admin-1', amount: 20000, reason: 'Saldo de pruebas', operationKey: `k-${goalkeeperId}` });
    }
    await ledger.chargeCommission(owner(goalkeeperId), { bookingId: booking.id, requestId: booking.requestId, amount: booking.commission });
    h.bookingRepository.seed(booking.assign(goalkeeperId, h.clock.now()));
  };
  const balanceOf = async (goalkeeperId: string) => (await wallet.findByGoalkeeperId(goalkeeperId))?.balance ?? 0;
  /** Stores the booking as assigned to the goalkeeper. */
  const assign = (booking: Booking, goalkeeperId: string) => h.bookingRepository.seed(booking.assign(goalkeeperId, h.clock.now()));
  const current = (id: string) => h.bookingRepository.all().find((booking) => booking.id === id)!;
  const request = (id: string) => h.requestRepository.all().find((item) => item.id === id)!;
  return {
    ...h,
    wallet,
    outbox,
    store,
    relayed,
    relay,
    idGenerator,
    expiryJob,
    clientNotices,
    cancelAllJob,
    goalkeeperNotices,
    acceptAndPay,
    balanceOf,
    assign,
    current,
    request,
    BookingEntity,
  };
}
