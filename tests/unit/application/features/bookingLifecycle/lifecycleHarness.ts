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
import { CancelBookingsByClientCommand } from '../../../../../src/application/features/bookingLifecycle/commands/cancelBookingsByClient/cancelBookingsByClientCommand.js';
import { CancelBookingsByClientCommandHandler } from '../../../../../src/application/features/bookingLifecycle/commands/cancelBookingsByClient/cancelBookingsByClientCommandHandler.js';
import { FakeBookingAuditLogger } from '../../../../fakes/fakeBookingAuditLogger.js';
import { FakeUserRepository } from '../../../../fakes/fakeUserRepository.js';
import { WithdrawFromBookingCommand } from '../../../../../src/application/features/bookingLifecycle/commands/withdrawFromBooking/withdrawFromBookingCommand.js';
import { WithdrawFromBookingCommandHandler } from '../../../../../src/application/features/bookingLifecycle/commands/withdrawFromBooking/withdrawFromBookingCommandHandler.js';
import { ReverseWithdrawalPenaltyCommand } from '../../../../../src/application/features/bookingLifecycle/commands/reverseWithdrawalPenalty/reverseWithdrawalPenaltyCommand.js';
import { ReverseWithdrawalPenaltyCommandHandler } from '../../../../../src/application/features/bookingLifecycle/commands/reverseWithdrawalPenalty/reverseWithdrawalPenaltyCommandHandler.js';
import { CheckInToBookingCommand, type CheckInLocation } from '../../../../../src/application/features/bookingLifecycle/commands/checkInToBooking/checkInToBookingCommand.js';
import { CheckInToBookingCommandHandler } from '../../../../../src/application/features/bookingLifecycle/commands/checkInToBooking/checkInToBookingCommandHandler.js';
import { createCheckInWindowResolver } from '../../../../../src/application/features/bookingLifecycle/common/checkInWindowResolver.js';
import { StoredImage } from '../../../../../src/domain/images/storedImage.js';
import { FakeImageRepository } from '../../../../fakes/fakeImageRepository.js';
import { CheckInNoticeHandler } from '../../../../../src/application/features/bookingLifecycle/handlers/checkInNoticeHandler.js';
import { RateBookingCommand } from '../../../../../src/application/features/ratings/commands/rateBooking/rateBookingCommand.js';
import { RateBookingCommandHandler } from '../../../../../src/application/features/ratings/commands/rateBooking/rateBookingCommandHandler.js';
import { ListPendingRatingsQuery } from '../../../../../src/application/features/ratings/queries/listPendingRatings/listPendingRatingsQuery.js';
import { ListPendingRatingsQueryHandler } from '../../../../../src/application/features/ratings/queries/listPendingRatings/listPendingRatingsQueryHandler.js';
import { ListCasesQuery } from '../../../../../src/application/features/cases/queries/listCases/listCasesQuery.js';
import { ListCasesQueryHandler } from '../../../../../src/application/features/cases/queries/listCases/listCasesQueryHandler.js';
import { ResolveCaseCommand } from '../../../../../src/application/features/cases/commands/resolveCase/resolveCaseCommand.js';
import { ResolveCaseCommandHandler } from '../../../../../src/application/features/cases/commands/resolveCase/resolveCaseCommandHandler.js';
import { NoShowWatchJob } from '../../../../../src/application/features/bookingLifecycle/jobs/noShowWatchJob.js';
import { NoShowNoticeHandler } from '../../../../../src/application/features/bookingLifecycle/handlers/noShowNoticeHandler.js';
import { createNoShowGraceResolver } from '../../../../../src/application/features/bookingLifecycle/common/checkInWindowResolver.js';
import { FakeRatingRepository } from '../../../../fakes/fakeRatingRepository.js';
import { FakeCaseRepository } from '../../../../fakes/fakeCaseRepository.js';
import { BookingCompletionJob } from '../../../../../src/application/features/bookingLifecycle/jobs/bookingCompletionJob.js';
import { CheckInWatchJob } from '../../../../../src/application/features/bookingLifecycle/jobs/checkInWatchJob.js';
import { ContactsRevealJob } from '../../../../../src/application/features/bookingLifecycle/jobs/contactsRevealJob.js';
import { ClientAssignmentNoticeHandler } from '../../../../../src/application/features/bookingLifecycle/handlers/clientAssignmentNoticeHandler.js';
import { WithdrawalNoticeHandler } from '../../../../../src/application/features/bookingLifecycle/handlers/withdrawalNoticeHandler.js';
import { FakeBookingSettingsRepository } from '../../../../fakes/fakeBookingSettingsRepository.js';
import { FakeGoalkeeperIncidentRepository } from '../../../../fakes/fakeGoalkeeperIncidentRepository.js';

/**
 * 015's offer harness (requests in Bello, inbox, push) plus the lifecycle store over fakes, a
 * relay that just records what it published, and the client outcome consumer.
 */
export function lifecycleHarness() {
  const h = offerHarness();
  const wallet = new FakeWalletStore(() => h.clock.now());
  const outbox = new FakeOutboxStore();
  const store = new FakeBookingLifecycleStore(h.bookingRepository, h.requestRepository, wallet, outbox, h.goalkeeperProfileRepository);
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
  // Client cancellation (feature 017).
  const audit = new FakeBookingAuditLogger();
  const clientCancel = new CancelBookingsByClientCommandHandler({
    requestRepository: h.requestRepository,
    bookingRepository: h.bookingRepository,
    userRepository: new FakeUserRepository(),
    store,
    walletContext,
    relay,
    idGenerator,
    clock: h.clock,
    audit,
    logger: h.silent,
  });
  /** The client (`client-a`, the owner of every `match()`) cancels a booking, or the whole request with `null`. */
  const cancel = (requestId: string, bookingId: string | null, reason?: string, clientId = 'client-a') =>
    clientCancel.handle(new CancelBookingsByClientCommand(clientId, requestId, bookingId, reason));
  // Goalkeeper withdrawal (feature 018).
  const bookingSettingsRepository = new FakeBookingSettingsRepository();
  const warnings: Record<string, unknown>[] = [];
  const lifecycleLogger = { info: () => undefined, warn: (entry: Record<string, unknown>) => void warnings.push(entry) };
  const withdrawer = new WithdrawFromBookingCommandHandler({
    walletContext,
    bookingSettingsRepository,
    store,
    bookingRepository: h.bookingRepository,
    requestRepository: h.requestRepository,
    zoneRepository: h.zoneRepository,
    cityRepository: h.cityRepository,
    relay,
    idGenerator,
    clock: h.clock,
    audit,
    logger: lifecycleLogger,
  });
  /** The goalkeeper withdraws from the booking. */
  const withdraw = (bookingId: string, goalkeeperId: string, reason?: string) =>
    withdrawer.handle(new WithdrawFromBookingCommand(goalkeeperId, bookingId, reason));
  const withdrawalNotices = new WithdrawalNoticeHandler({
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
  const incidents = new FakeGoalkeeperIncidentRepository(store);
  // Assignment notices to the client (feature 019).
  const users = new FakeUserRepository();
  const assignmentNotices = new ClientAssignmentNoticeHandler({
    requestRepository: h.requestRepository,
    bookingRepository: h.bookingRepository,
    userRepository: users,
    zoneRepository: h.zoneRepository,
    cityRepository: h.cityRepository,
    notifications: h.notifications,
    pushNotifier: h.pushNotifier,
    processed: new FakeProcessedEventStore(),
    idGenerator,
    clock: h.clock,
    logger: h.silent,
  });
  const contactsRevealJob = new ContactsRevealJob({
    requestRepository: h.requestRepository,
    bookingRepository: h.bookingRepository,
    userRepository: users,
    zoneRepository: h.zoneRepository,
    cityRepository: h.cityRepository,
    notifications: h.notifications,
    pushNotifier: h.pushNotifier,
    idGenerator,
    clock: h.clock,
    logger: h.silent,
  });
  // Check-in (feature 020).
  const imageRepository = new FakeImageRepository();
  const windowResolver = () =>
    createCheckInWindowResolver({ cityRepository: h.cityRepository, regionRepository, bookingSettingsRepository, logger: lifecycleLogger });
  const checkInHandler = new CheckInToBookingCommandHandler({
    goalkeeperProfileRepository: h.goalkeeperProfileRepository,
    imageRepository,
    bookingRepository: h.bookingRepository,
    requestRepository: h.requestRepository,
    zoneRepository: h.zoneRepository,
    cityRepository: h.cityRepository,
    userRepository: users,
    windowResolver,
    store,
    relay,
    idGenerator,
    clock: h.clock,
    audit,
  });
  let photos = 0;
  /** A photo uploaded by the user; returns its id. */
  const photo = (userId: string) => {
    const id = `img-${++photos}`;
    imageRepository.seed(new StoredImage({ id, externalId: id, url: `https://img.example/${id}.jpg`, format: 'jpg', bytes: 1000, width: 10, height: 10, uploadedBy: userId, createdAt: h.clock.now() }));
    return id;
  };
  /** The goalkeeper checks in to the booking with the photo and, optionally, a location. */
  const checkIn = (bookingId: string, goalkeeperId: string, imageId: string, location?: CheckInLocation) =>
    checkInHandler.handle(new CheckInToBookingCommand(goalkeeperId, bookingId, imageId, location));
  const checkInNotices = new CheckInNoticeHandler({
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
  const checkInWatchJob = new CheckInWatchJob({
    bookingRepository: h.bookingRepository,
    requestRepository: h.requestRepository,
    userRepository: users,
    zoneRepository: h.zoneRepository,
    cityRepository: h.cityRepository,
    notifications: h.notifications,
    pushNotifier: h.pushNotifier,
    idGenerator,
    clock: h.clock,
    logger: h.silent,
    windowResolver,
  });
  const completionJob = new BookingCompletionJob({ bookingRepository: h.bookingRepository, store, relay, idGenerator, logger: h.silent });
  // Ratings, no-shows and cases (feature 021).
  const ratingRepository = new FakeRatingRepository(() => store.ratings());
  const caseRepository = new FakeCaseRepository(store.cases);
  const penaltyDeps = { walletContext, bookingSettingsRepository, logger: lifecycleLogger };
  const rater = new RateBookingCommandHandler({ ...penaltyDeps, bookingRepository: h.bookingRepository, store, relay, idGenerator, clock: h.clock, audit });
  /** The user (the booking's client or goalkeeper) rates it. */
  const rate = (bookingId: string, userId: string, answer: boolean, stars = 4, comment?: string) =>
    rater.handle(new RateBookingCommand(userId, bookingId, answer, stars, comment));
  const pendingHandler = new ListPendingRatingsQueryHandler({
    bookingRepository: h.bookingRepository,
    ratingRepository,
    requestRepository: h.requestRepository,
    zoneRepository: h.zoneRepository,
    cityRepository: h.cityRepository,
    userRepository: users,
    clock: h.clock,
  });
  const pending = async (userId: string) => (await pendingHandler.handle(new ListPendingRatingsQuery(userId))).items;
  const noShowJob = new NoShowWatchJob({
    ...penaltyDeps,
    bookingRepository: h.bookingRepository,
    requestRepository: h.requestRepository,
    store,
    relay,
    idGenerator,
    clock: h.clock,
    graceResolver: () => createNoShowGraceResolver({ cityRepository: h.cityRepository, regionRepository, bookingSettingsRepository, logger: lifecycleLogger }),
  });
  const noShowNotices = new NoShowNoticeHandler({
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
  const listCasesHandler = new ListCasesQueryHandler(caseRepository);
  const listCases = (status: 'open' | 'resolved' | null = null, page = 1, pageSize = 20) => listCasesHandler.handle(new ListCasesQuery(status, page, pageSize));
  const resolver = new ResolveCaseCommandHandler(caseRepository, ratingRepository, h.clock, audit);
  const resolveCase = (caseId: string, note: string, adminId = 'admin-1') => resolver.handle(new ResolveCaseCommand(adminId, caseId, note));
  const reverser = new ReverseWithdrawalPenaltyCommandHandler({ walletContext, store, idGenerator, clock: h.clock, audit, logger: lifecycleLogger });
  /** An administrator reverses the goalkeeper's withdrawal: `refund` the money and/or `lift` the suspensions. */
  const reverse = (goalkeeperId: string, withdrawalId: string, what: { refund?: boolean; lift?: boolean }, reason = 'Incapacidad médica') =>
    reverser.handle(new ReverseWithdrawalPenaltyCommand('admin-1', goalkeeperId, withdrawalId, what.refund ?? false, what.lift ?? false, reason));
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
    cancel,
    audit,
    walletContext,
    bookingSettingsRepository,
    warnings,
    withdraw,
    withdrawalNotices,
    incidents,
    users,
    assignmentNotices,
    contactsRevealJob,
    imageRepository,
    regionRepository,
    windowResolver,
    photo,
    checkIn,
    checkInNotices,
    checkInWatchJob,
    completionJob,
    rate,
    pending,
    noShowJob,
    noShowNotices,
    caseRepository,
    listCases,
    resolveCase,
    reverse,
    ledger,
    owner,
    assign,
    current,
    request,
    BookingEntity,
  };
}
