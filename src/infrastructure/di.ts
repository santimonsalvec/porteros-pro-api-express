import { Mediator, registerHandlers, registerSubscribers } from '../application/common/mediator/mediator.js';
import { GetSsoOptionsQuery } from '../application/features/auth/queries/getSsoOptions/getSsoOptionsQuery.js';
import { GetSsoOptionsQueryHandler } from '../application/features/auth/queries/getSsoOptions/getSsoOptionsQueryHandler.js';
import { ExchangeSsoCredentialCommand } from '../application/features/auth/commands/exchangeSsoCredential/exchangeSsoCredentialCommand.js';
import { ExchangeSsoCredentialCommandHandler } from '../application/features/auth/commands/exchangeSsoCredential/exchangeSsoCredentialCommandHandler.js';
import { RefreshAccessTokenCommand } from '../application/features/auth/commands/refreshAccessToken/refreshAccessTokenCommand.js';
import { RefreshAccessTokenCommandHandler } from '../application/features/auth/commands/refreshAccessToken/refreshAccessTokenCommandHandler.js';
import { CompleteProfileCommand } from '../application/features/profile/commands/completeProfile/completeProfileCommand.js';
import { CompleteProfileCommandHandler } from '../application/features/profile/commands/completeProfile/completeProfileCommandHandler.js';
import { GetClientProfileQuery } from '../application/features/clients/queries/getClientProfile/getClientProfileQuery.js';
import { GetClientProfileQueryHandler } from '../application/features/clients/queries/getClientProfile/getClientProfileQueryHandler.js';
import { UpdateClientProfileCommand } from '../application/features/clients/commands/updateClientProfile/updateClientProfileCommand.js';
import { UpdateClientProfileCommandHandler } from '../application/features/clients/commands/updateClientProfile/updateClientProfileCommandHandler.js';
import { GetCountriesQuery } from '../application/features/locations/queries/getCountries/getCountriesQuery.js';
import { GetCountriesQueryHandler } from '../application/features/locations/queries/getCountries/getCountriesQueryHandler.js';
import { GetCitiesQuery } from '../application/features/locations/queries/getCities/getCitiesQuery.js';
import { GetCitiesQueryHandler } from '../application/features/locations/queries/getCities/getCitiesQueryHandler.js';
import { GetBookingConfigQuery } from '../application/features/goalkeeperRequests/queries/getBookingConfig/getBookingConfigQuery.js';
import { GetBookingConfigQueryHandler } from '../application/features/goalkeeperRequests/queries/getBookingConfig/getBookingConfigQueryHandler.js';
import { GetServiceQuoteQuery } from '../application/features/goalkeeperRequests/queries/getServiceQuote/getServiceQuoteQuery.js';
import { GetServiceQuoteQueryHandler } from '../application/features/goalkeeperRequests/queries/getServiceQuote/getServiceQuoteQueryHandler.js';
import { ConfirmBookingCommand } from '../application/features/goalkeeperRequests/commands/confirmBooking/confirmBookingCommand.js';
import { ListClientRequestsQuery } from '../application/features/goalkeeperRequests/queries/listClientRequests/listClientRequestsQuery.js';
import { ListClientRequestsQueryHandler } from '../application/features/goalkeeperRequests/queries/listClientRequests/listClientRequestsQueryHandler.js';
import { ConfirmBookingCommandHandler } from '../application/features/goalkeeperRequests/commands/confirmBooking/confirmBookingCommandHandler.js';
import { IssueServiceQuoteCommand } from '../application/features/goalkeeperRequests/commands/issueServiceQuote/issueServiceQuoteCommand.js';
import { IssueServiceQuoteCommandHandler } from '../application/features/goalkeeperRequests/commands/issueServiceQuote/issueServiceQuoteCommandHandler.js';
import { GetZonesByCityQuery } from '../application/features/zones/queries/getZonesByCity/getZonesByCityQuery.js';
import { GetZonesByCityQueryHandler } from '../application/features/zones/queries/getZonesByCity/getZonesByCityQueryHandler.js';
import { StoreImageCommand } from '../application/features/images/commands/storeImage/storeImageCommand.js';
import { StoreImageCommandHandler } from '../application/features/images/commands/storeImage/storeImageCommandHandler.js';
import { ResolveImageQuery } from '../application/features/images/queries/resolveImage/resolveImageQuery.js';
import { ResolveImageQueryHandler } from '../application/features/images/queries/resolveImage/resolveImageQueryHandler.js';
import { DeleteImageCommand } from '../application/features/images/commands/deleteImage/deleteImageCommand.js';
import { DeleteImageCommandHandler } from '../application/features/images/commands/deleteImage/deleteImageCommandHandler.js';
import { GetGoalkeeperRegistrationQuery } from '../application/features/goalkeepers/queries/getGoalkeeperRegistration/getGoalkeeperRegistrationQuery.js';
import { GetGoalkeeperRegistrationQueryHandler } from '../application/features/goalkeepers/queries/getGoalkeeperRegistration/getGoalkeeperRegistrationQueryHandler.js';
import { GetDocumentTypesQuery } from '../application/features/goalkeepers/queries/getDocumentTypes/getDocumentTypesQuery.js';
import { GetDocumentTypesQueryHandler } from '../application/features/goalkeepers/queries/getDocumentTypes/getDocumentTypesQueryHandler.js';
import { SaveIdentificationSectionCommand } from '../application/features/goalkeepers/commands/saveIdentificationSection/saveIdentificationSectionCommand.js';
import { SaveIdentificationSectionCommandHandler } from '../application/features/goalkeepers/commands/saveIdentificationSection/saveIdentificationSectionCommandHandler.js';
import { SavePhysicalDataSectionCommand } from '../application/features/goalkeepers/commands/savePhysicalDataSection/savePhysicalDataSectionCommand.js';
import { SavePhysicalDataSectionCommandHandler } from '../application/features/goalkeepers/commands/savePhysicalDataSection/savePhysicalDataSectionCommandHandler.js';
import { SaveAvailabilitySectionCommand } from '../application/features/goalkeepers/commands/saveAvailabilitySection/saveAvailabilitySectionCommand.js';
import { SaveAvailabilitySectionCommandHandler } from '../application/features/goalkeepers/commands/saveAvailabilitySection/saveAvailabilitySectionCommandHandler.js';
import { SaveDocumentPhotoCommand } from '../application/features/goalkeepers/commands/saveDocumentPhoto/saveDocumentPhotoCommand.js';
import { SaveDocumentPhotoCommandHandler } from '../application/features/goalkeepers/commands/saveDocumentPhoto/saveDocumentPhotoCommandHandler.js';
import { ActivateGoalkeeperCommand } from '../application/features/goalkeepers/commands/activateGoalkeeper/activateGoalkeeperCommand.js';
import { ActivateGoalkeeperCommandHandler } from '../application/features/goalkeepers/commands/activateGoalkeeper/activateGoalkeeperCommandHandler.js';
import { UpdateGoalkeeperPhysicalDataCommand } from '../application/features/goalkeepers/commands/updateGoalkeeperPhysicalData/updateGoalkeeperPhysicalDataCommand.js';
import { UpdateGoalkeeperPhysicalDataCommandHandler } from '../application/features/goalkeepers/commands/updateGoalkeeperPhysicalData/updateGoalkeeperPhysicalDataCommandHandler.js';
import { UpdateGoalkeeperAvailabilityCommand } from '../application/features/goalkeepers/commands/updateGoalkeeperAvailability/updateGoalkeeperAvailabilityCommand.js';
import { UpdateGoalkeeperAvailabilityCommandHandler } from '../application/features/goalkeepers/commands/updateGoalkeeperAvailability/updateGoalkeeperAvailabilityCommandHandler.js';
import { CancelGoalkeeperRegistrationCommand } from '../application/features/goalkeepers/commands/cancelGoalkeeperRegistration/cancelGoalkeeperRegistrationCommand.js';
import { CancelGoalkeeperRegistrationCommandHandler } from '../application/features/goalkeepers/commands/cancelGoalkeeperRegistration/cancelGoalkeeperRegistrationCommandHandler.js';
import type { AppDependencies } from '../appDependencies.js';
import { assertEventsConfig, assertOffersConfig, assertPushConfig, config } from './config.js';
import { MongoConnectionProvider } from './persistence/mongo/mongoConnectionProvider.js';
import { UserRepository } from './persistence/mongo/userRepository.js';
import { RefreshTokenRepository } from './persistence/mongo/refreshTokenRepository.js';
import { TermsAcceptanceRepository } from './persistence/mongo/termsAcceptanceRepository.js';
import { CountryRepository } from './persistence/mongo/countryRepository.js';
import { CommissionResolver } from '../application/features/wallet/common/commissionResolver.js';
import { WalletLedger } from '../application/features/wallet/common/walletLedger.js';
import { ListAvailableBookingsQuery } from '../application/features/goalkeeperRequests/queries/listAvailableBookings/listAvailableBookingsQuery.js';
import { ListGoalkeeperAgendaQuery } from '../application/features/goalkeeperRequests/queries/listGoalkeeperAgenda/listGoalkeeperAgendaQuery.js';
import { ListGoalkeeperAgendaQueryHandler } from '../application/features/goalkeeperRequests/queries/listGoalkeeperAgenda/listGoalkeeperAgendaQueryHandler.js';
import { AcceptBookingCommand } from '../application/features/goalkeeperRequests/commands/acceptBooking/acceptBookingCommand.js';
import { AcceptBookingCommandHandler } from '../application/features/goalkeeperRequests/commands/acceptBooking/acceptBookingCommandHandler.js';
import { MongoBookingAcceptanceStore } from './persistence/mongo/bookingAcceptanceStore.js';
import { ListAvailableBookingsQueryHandler } from '../application/features/goalkeeperRequests/queries/listAvailableBookings/listAvailableBookingsQueryHandler.js';
import { RecordWalletAdjustmentCommand } from '../application/features/wallet/commands/recordWalletAdjustment/recordWalletAdjustmentCommand.js';
import { RecordWalletAdjustmentCommandHandler } from '../application/features/wallet/commands/recordWalletAdjustment/recordWalletAdjustmentCommandHandler.js';
import { ApplyGatewayEventCommand } from '../application/features/payments/commands/applyGatewayEvent/applyGatewayEventCommand.js';
import { ApplyGatewayEventCommandHandler } from '../application/features/payments/commands/applyGatewayEvent/applyGatewayEventCommandHandler.js';
import { TopUpReconcileJob } from '../application/features/payments/jobs/topUpReconcileJob.js';
import { ListTopUpsQuery } from '../application/features/payments/queries/listTopUps/listTopUpsQuery.js';
import { ListTopUpsQueryHandler } from '../application/features/payments/queries/listTopUps/listTopUpsQueryHandler.js';
import { GetTopUpQuery } from '../application/features/payments/queries/getTopUp/getTopUpQuery.js';
import { GetTopUpQueryHandler } from '../application/features/payments/queries/getTopUp/getTopUpQueryHandler.js';
import { GetTopUpByReferenceQuery } from '../application/features/payments/queries/getTopUpByReference/getTopUpByReferenceQuery.js';
import { GetTopUpByReferenceQueryHandler } from '../application/features/payments/queries/getTopUpByReference/getTopUpByReferenceQueryHandler.js';
import { SetGatewaySettingsCommand } from '../application/features/payments/commands/setGatewaySettings/setGatewaySettingsCommand.js';
import { SetGatewaySettingsCommandHandler } from '../application/features/payments/commands/setGatewaySettings/setGatewaySettingsCommandHandler.js';
import { GetGatewaySettingsQuery } from '../application/features/payments/queries/getGatewaySettings/getGatewaySettingsQuery.js';
import { GetGatewaySettingsQueryHandler } from '../application/features/payments/queries/getGatewaySettings/getGatewaySettingsQueryHandler.js';
import { TaxSettingsRepository } from './persistence/mongo/taxSettingsRepository.js';
import { createVatRateResolver } from '../application/features/wallet/common/vatRateResolver.js';
import { InvoicingDocumentRepository } from './persistence/mongo/invoicingDocumentRepository.js';
import { InvoicingSettingsRepository } from './persistence/mongo/invoicingSettingsRepository.js';
import { BillableMovementScanner } from './persistence/mongo/billableMovementScanner.js';
import { InvoicingProviderRegistry } from './invoicing/invoicingProviderRegistry.js';
import { SiigoInvoicingProvider } from './invoicing/siigoInvoicingProvider.js';
import { EnvInvoicingSecrets } from './invoicing/envInvoicingSecrets.js';
import { CreateInvoicingDocumentHandler } from '../application/features/invoicing/handlers/createInvoicingDocument.js';
import { InvoicingIssuerJob } from '../application/features/invoicing/jobs/invoicingIssuerJob.js';
import { BILLING_EVENT_TYPES } from '../domain/events/billingEvents.js';
import { ListMyDocumentsQuery } from '../application/features/invoicing/queries/listMyDocuments/listMyDocumentsQuery.js';
import { ListMyDocumentsQueryHandler } from '../application/features/invoicing/queries/listMyDocuments/listMyDocumentsQueryHandler.js';
import { GetMyDocumentQuery } from '../application/features/invoicing/queries/getMyDocument/getMyDocumentQuery.js';
import { GetMyDocumentQueryHandler } from '../application/features/invoicing/queries/getMyDocument/getMyDocumentQueryHandler.js';
import { GetDocumentFileQuery } from '../application/features/invoicing/queries/getDocumentFile/getDocumentFileQuery.js';
import { GetDocumentFileQueryHandler } from '../application/features/invoicing/queries/getDocumentFile/getDocumentFileQueryHandler.js';
import { SetTaxSettingsCommand } from '../application/features/invoicing/commands/setTaxSettings/setTaxSettingsCommand.js';
import { SetTaxSettingsCommandHandler } from '../application/features/invoicing/commands/setTaxSettings/setTaxSettingsCommandHandler.js';
import { GetTaxSettingsQuery } from '../application/features/invoicing/queries/getTaxSettings/getTaxSettingsQuery.js';
import { GetTaxSettingsQueryHandler } from '../application/features/invoicing/queries/getTaxSettings/getTaxSettingsQueryHandler.js';
import { SetInvoicingSettingsCommand } from '../application/features/invoicing/commands/setInvoicingSettings/setInvoicingSettingsCommand.js';
import { SetInvoicingSettingsCommandHandler } from '../application/features/invoicing/commands/setInvoicingSettings/setInvoicingSettingsCommandHandler.js';
import { GetInvoicingSettingsQuery } from '../application/features/invoicing/queries/getInvoicingSettings/getInvoicingSettingsQuery.js';
import { GetInvoicingSettingsQueryHandler } from '../application/features/invoicing/queries/getInvoicingSettings/getInvoicingSettingsQueryHandler.js';
import { ListDocumentsForAdminQuery } from '../application/features/invoicing/queries/listDocumentsForAdmin/listDocumentsForAdminQuery.js';
import { ListDocumentsForAdminQueryHandler } from '../application/features/invoicing/queries/listDocumentsForAdmin/listDocumentsForAdminQueryHandler.js';
import { RetryDocumentCommand } from '../application/features/invoicing/commands/retryDocument/retryDocumentCommand.js';
import { RetryDocumentCommandHandler } from '../application/features/invoicing/commands/retryDocument/retryDocumentCommandHandler.js';
import { GetTopUpOptionsQuery } from '../application/features/payments/queries/getTopUpOptions/getTopUpOptionsQuery.js';
import { GetTopUpOptionsQueryHandler } from '../application/features/payments/queries/getTopUpOptions/getTopUpOptionsQueryHandler.js';
import { StartTopUpCommand } from '../application/features/payments/commands/startTopUp/startTopUpCommand.js';
import { StartTopUpCommandHandler } from '../application/features/payments/commands/startTopUp/startTopUpCommandHandler.js';
import { AcceptCurrentTermsCommand } from '../application/features/profile/commands/acceptCurrentTerms/acceptCurrentTermsCommand.js';
import { AcceptCurrentTermsCommandHandler } from '../application/features/profile/commands/acceptCurrentTerms/acceptCurrentTermsCommandHandler.js';
import { GetGoalkeeperWalletQuery } from '../application/features/wallet/queries/getGoalkeeperWallet/getGoalkeeperWalletQuery.js';
import { GetGoalkeeperWalletQueryHandler } from '../application/features/wallet/queries/getGoalkeeperWallet/getGoalkeeperWalletQueryHandler.js';
import { ListWalletMovementsQuery } from '../application/features/wallet/queries/listWalletMovements/listWalletMovementsQuery.js';
import { ListWalletMovementsQueryHandler } from '../application/features/wallet/queries/listWalletMovements/listWalletMovementsQueryHandler.js';
import { CommissionSettingRepository } from './persistence/mongo/commissionSettingRepository.js';
import { WalletMovementRepository } from './persistence/mongo/walletMovementRepository.js';
import { WalletRepository } from './persistence/mongo/walletRepository.js';
import { logger } from './observability/logger.js';
import { TopUpRepository } from './persistence/mongo/topUpRepository.js';
import { MongoTopUpStore } from './persistence/mongo/topUpStore.js';
import { PaymentGatewaySettingsRepository } from './persistence/mongo/paymentGatewaySettingsRepository.js';
import { PaymentGatewayRegistry } from './payments/gatewayRegistry.js';
import { EnvPaymentSecrets } from './payments/envPaymentSecrets.js';
import { WompiGateway } from './payments/wompiGateway.js';
import { MongoWalletStore } from './persistence/mongo/walletStore.js';
import { CityRepository } from './persistence/mongo/cityRepository.js';
import { RegionRepository } from './persistence/mongo/regionRepository.js';
import { ZoneRepository } from './persistence/mongo/zoneRepository.js';
import { ImageRepository } from './persistence/mongo/imageRepository.js';
import { GoogleIdTokenValidator } from './auth/googleIdTokenValidator.js';
import { JwtInternalTokenIssuer } from './auth/jwtInternalTokenIssuer.js';
import { GoogleSsoProviderCatalog } from './auth/googleSsoProviderCatalog.js';
import { DEFAULT_GOOGLE_SCOPES } from './auth/googleSsoOptions.js';
import { PinoAuditLogger } from './observability/pinoAuditLogger.js';
import { UuidIdGenerator } from './uuidIdGenerator.js';
import { SystemClock } from './systemClock.js';
import { RentalRateRepository } from './persistence/mongo/rentalRateRepository.js';
import { BookingSettingsRepository } from './persistence/mongo/bookingSettingsRepository.js';
import { QuoteRepository } from './persistence/mongo/quoteRepository.js';
import { BookingRepository } from './persistence/mongo/bookingRepository.js';
import { GoalkeeperRequestRepository } from './persistence/mongo/goalkeeperRequestRepository.js';
import { MongoQuoteConfirmationStore } from './persistence/mongo/quoteConfirmationStore.js';
import { MongoHealthCheck } from './healthChecks/mongoHealthCheck.js';
import { CloudinaryImageStorageProvider } from './images/cloudinaryImageStorageProvider.js';
import { GoalkeeperRegistrationRepository } from './persistence/mongo/goalkeeperRegistrationRepository.js';
import { DocumentTypeRepository } from './persistence/mongo/documentTypeRepository.js';
import { GoalkeeperProfileRepository } from './persistence/mongo/goalkeeperProfileRepository.js';
import { MongoOutboxStore } from './persistence/mongo/outboxStore.js';
import { MongoJobLockStore } from './persistence/mongo/jobLockStore.js';
import { MongoProcessedEventStore } from './persistence/mongo/processedEventStore.js';
import { MongoEventDeliveryLog } from './persistence/mongo/eventDeliveryLogRepository.js';
import { GoogleOidcVerifier } from './events/googleOidcVerifier.js';
import { DELIVERY_LOG_EVENT_TYPES, LogEventDeliveryHandler } from '../application/features/events/handlers/logEventDelivery.js';
import { PubSubEventPublisher } from './events/pubSubEventPublisher.js';
import { InProcessEventPublisher } from './events/inProcessEventPublisher.js';
import { EventRelay } from '../application/features/events/common/eventRelay.js';
import { RunSweepCommand } from '../application/features/events/commands/runSweep/runSweepCommand.js';
import { RunSweepCommandHandler } from '../application/features/events/commands/runSweep/runSweepCommandHandler.js';
import { RegisterDeviceCommand } from '../application/features/devices/commands/registerDevice/registerDeviceCommand.js';
import { RegisterDeviceCommandHandler } from '../application/features/devices/commands/registerDevice/registerDeviceCommandHandler.js';
import { UnregisterDeviceCommand } from '../application/features/devices/commands/unregisterDevice/unregisterDeviceCommand.js';
import { UnregisterDeviceCommandHandler } from '../application/features/devices/commands/unregisterDevice/unregisterDeviceCommandHandler.js';
import { SendTestPushCommand } from '../application/features/devices/commands/sendTestPush/sendTestPushCommand.js';
import { SendTestPushCommandHandler } from '../application/features/devices/commands/sendTestPush/sendTestPushCommandHandler.js';
import { PushNotifier } from '../application/features/devices/common/pushNotifier.js';
import { MongoDeviceRepository } from './persistence/mongo/deviceRepository.js';
import { FcmPushSender } from './push/fcmPushSender.js';
import { LoggingPushSender } from './push/loggingPushSender.js';
import { InMemoryRateLimiter } from './push/inMemoryRateLimiter.js';
import { sha256TokenFingerprint } from './push/tokenRef.js';
import { OfferEligibilityService } from '../application/features/notifications/common/offerEligibilityService.js';
import { OfferSender } from '../application/features/notifications/common/offerSender.js';
import { NotifyBookingOffersCommand } from '../application/features/notifications/commands/notifyBookingOffers/notifyBookingOffersCommand.js';
import { NotifyBookingOffersCommandHandler } from '../application/features/notifications/commands/notifyBookingOffers/notifyBookingOffersCommandHandler.js';
import { SetOffersAvailabilityCommand } from '../application/features/notifications/commands/setOffersAvailability/setOffersAvailabilityCommand.js';
import { SetOffersAvailabilityCommandHandler } from '../application/features/notifications/commands/setOffersAvailability/setOffersAvailabilityCommandHandler.js';
import { OfferRemindersJob } from '../application/features/notifications/jobs/offerRemindersJob.js';
import { ListNotificationsQuery } from '../application/features/notifications/queries/listNotifications/listNotificationsQuery.js';
import { ListNotificationsQueryHandler } from '../application/features/notifications/queries/listNotifications/listNotificationsQueryHandler.js';
import { MarkNotificationReadCommand } from '../application/features/notifications/commands/markNotificationRead/markNotificationReadCommand.js';
import { MarkNotificationReadCommandHandler } from '../application/features/notifications/commands/markNotificationRead/markNotificationReadCommandHandler.js';
import { MarkAllNotificationsReadCommand } from '../application/features/notifications/commands/markAllNotificationsRead/markAllNotificationsReadCommand.js';
import { MarkAllNotificationsReadCommandHandler } from '../application/features/notifications/commands/markAllNotificationsRead/markAllNotificationsReadCommandHandler.js';
import { DismissOfferCommand } from '../application/features/notifications/commands/dismissOffer/dismissOfferCommand.js';
import { DismissOfferCommandHandler } from '../application/features/notifications/commands/dismissOffer/dismissOfferCommandHandler.js';
import { BookingExpiryJob } from '../application/features/bookingLifecycle/jobs/bookingExpiryJob.js';
import { CLIENT_OUTCOME_EVENT_TYPES, ClientOutcomeNoticeHandler } from '../application/features/bookingLifecycle/handlers/clientOutcomeNoticeHandler.js';
import { MongoBookingLifecycleStore } from './persistence/mongo/bookingLifecycleStore.js';
import { GoalkeeperIncidentRepository } from './persistence/mongo/goalkeeperIncidentRepository.js';
import { RatingRepository } from './persistence/mongo/ratingRepository.js';
import { CaseRepository } from './persistence/mongo/caseRepository.js';
import { CancelAllJob } from '../application/features/bookingLifecycle/jobs/cancelAllJob.js';
import { GOALKEEPER_CANCELLATION_EVENT_TYPES, GoalkeeperCancellationNoticeHandler } from '../application/features/bookingLifecycle/handlers/goalkeeperCancellationNoticeHandler.js';
import { CancelBookingsByClientCommand } from '../application/features/bookingLifecycle/commands/cancelBookingsByClient/cancelBookingsByClientCommand.js';
import { CancelBookingsByClientCommandHandler } from '../application/features/bookingLifecycle/commands/cancelBookingsByClient/cancelBookingsByClientCommandHandler.js';
import { ListGoalkeeperWithdrawalsQuery } from '../application/features/bookingLifecycle/queries/listGoalkeeperWithdrawals/listGoalkeeperWithdrawalsQuery.js';
import { ListGoalkeeperWithdrawalsQueryHandler } from '../application/features/bookingLifecycle/queries/listGoalkeeperWithdrawals/listGoalkeeperWithdrawalsQueryHandler.js';
import { ReverseWithdrawalPenaltyCommand } from '../application/features/bookingLifecycle/commands/reverseWithdrawalPenalty/reverseWithdrawalPenaltyCommand.js';
import { ReverseWithdrawalPenaltyCommandHandler } from '../application/features/bookingLifecycle/commands/reverseWithdrawalPenalty/reverseWithdrawalPenaltyCommandHandler.js';
import { CheckInToBookingCommand } from '../application/features/bookingLifecycle/commands/checkInToBooking/checkInToBookingCommand.js';
import { CheckInToBookingCommandHandler } from '../application/features/bookingLifecycle/commands/checkInToBooking/checkInToBookingCommandHandler.js';
import { createCheckInWindowResolver } from '../application/features/bookingLifecycle/common/checkInWindowResolver.js';
import { WithdrawFromBookingCommand } from '../application/features/bookingLifecycle/commands/withdrawFromBooking/withdrawFromBookingCommand.js';
import { WithdrawFromBookingCommandHandler } from '../application/features/bookingLifecycle/commands/withdrawFromBooking/withdrawFromBookingCommandHandler.js';
import { CHECK_IN_NOTICE_EVENT_TYPES, CheckInNoticeHandler } from '../application/features/bookingLifecycle/handlers/checkInNoticeHandler.js';
import { RateBookingCommand } from '../application/features/ratings/commands/rateBooking/rateBookingCommand.js';
import { RateBookingCommandHandler } from '../application/features/ratings/commands/rateBooking/rateBookingCommandHandler.js';
import { ListPendingRatingsQuery } from '../application/features/ratings/queries/listPendingRatings/listPendingRatingsQuery.js';
import { ListPendingRatingsQueryHandler } from '../application/features/ratings/queries/listPendingRatings/listPendingRatingsQueryHandler.js';
import { ListCasesQuery } from '../application/features/cases/queries/listCases/listCasesQuery.js';
import { ListCasesQueryHandler } from '../application/features/cases/queries/listCases/listCasesQueryHandler.js';
import { GetCaseQuery } from '../application/features/cases/queries/getCase/getCaseQuery.js';
import { GetCaseQueryHandler } from '../application/features/cases/queries/getCase/getCaseQueryHandler.js';
import { ResolveCaseCommand } from '../application/features/cases/commands/resolveCase/resolveCaseCommand.js';
import { ResolveCaseCommandHandler } from '../application/features/cases/commands/resolveCase/resolveCaseCommandHandler.js';
import { NoShowWatchJob } from '../application/features/bookingLifecycle/jobs/noShowWatchJob.js';
import { NO_SHOW_NOTICE_EVENT_TYPES, NoShowNoticeHandler } from '../application/features/bookingLifecycle/handlers/noShowNoticeHandler.js';
import { createNoShowGraceResolver } from '../application/features/bookingLifecycle/common/checkInWindowResolver.js';
import { BookingCompletionJob } from '../application/features/bookingLifecycle/jobs/bookingCompletionJob.js';
import { CheckInWatchJob } from '../application/features/bookingLifecycle/jobs/checkInWatchJob.js';
import { ContactsRevealJob } from '../application/features/bookingLifecycle/jobs/contactsRevealJob.js';
import { CLIENT_ASSIGNMENT_EVENT_TYPES, ClientAssignmentNoticeHandler } from '../application/features/bookingLifecycle/handlers/clientAssignmentNoticeHandler.js';
import { WITHDRAWAL_NOTICE_EVENT_TYPES, WithdrawalNoticeHandler } from '../application/features/bookingLifecycle/handlers/withdrawalNoticeHandler.js';
import { NotifyBookingOffersHandler, OFFER_EVENT_TYPES } from '../application/features/notifications/handlers/notifyBookingOffersHandler.js';
import { MongoNotificationRepository } from './persistence/mongo/notificationRepository.js';
import { MongoOfferPushStateStore } from './persistence/mongo/offerPushStateStore.js';

export interface CompositionRoot {
  dependencies: AppDependencies;
  close: () => Promise<void>;
}

/**
 * Composition root: wires every Application-layer port to its concrete Infrastructure
 * implementation and registers every handler on a single Mediator instance. Extended
 * incrementally as each user story adds repositories, services, and handlers.
 */
export async function buildDependencies(): Promise<CompositionRoot> {
  const connectionProvider = new MongoConnectionProvider();
  await connectionProvider.connect();
  const db = connectionProvider.getDb();

  const userRepository = new UserRepository(db);
  await userRepository.ensureIndexes();
  const refreshTokenRepository = new RefreshTokenRepository(db);
  const termsAcceptanceRepository = new TermsAcceptanceRepository(db);
  const countryRepository = new CountryRepository(db);
  const imageRepository = new ImageRepository(db);
  const goalkeeperRegistrationRepository = new GoalkeeperRegistrationRepository(db);
  await goalkeeperRegistrationRepository.ensureIndexes();
  const documentTypeRepository = new DocumentTypeRepository(db);
  const goalkeeperProfileRepository = new GoalkeeperProfileRepository(db);
  await goalkeeperProfileRepository.ensureIndexes();
  const cityRepository = new CityRepository(db);
  await cityRepository.ensureIndexes();
  const regionRepository = new RegionRepository(db);
  const zoneRepository = new ZoneRepository(db);
  await zoneRepository.ensureIndexes();
  const rentalRateRepository = new RentalRateRepository(db);
  await rentalRateRepository.ensureIndexes();
  const bookingSettingsRepository = new BookingSettingsRepository(db);
  await bookingSettingsRepository.ensureIndexes();
  const quoteRepository = new QuoteRepository(db);
  await quoteRepository.ensureIndexes();
  const requestRepository = new GoalkeeperRequestRepository(db);
  await requestRepository.ensureIndexes();
  const bookingRepository = new BookingRepository(db);
  await bookingRepository.ensureIndexes();
  const goalkeeperIncidentRepository = new GoalkeeperIncidentRepository(db);
  await goalkeeperIncidentRepository.ensureIndexes();
  const ratingRepository = new RatingRepository(db);
  await ratingRepository.ensureIndexes();
  const caseRepository = new CaseRepository(db);
  await caseRepository.ensureIndexes();
  const quoteConfirmationStore = new MongoQuoteConfirmationStore(() => connectionProvider.startSession(), db);
  const walletRepository = new WalletRepository(db);
  const walletMovementRepository = new WalletMovementRepository(db);
  await walletMovementRepository.ensureIndexes();
  const commissionSettingRepository = new CommissionSettingRepository(db);
  await commissionSettingRepository.ensureIndexes();
  const commissionResolver = new CommissionResolver(commissionSettingRepository, zoneRepository, cityRepository, regionRepository);
  const walletContext = { goalkeeperProfileRepository, cityRepository, regionRepository, countryLookup: countryRepository };
  // VAT on top of commissions (feature 023).
  const taxSettingsRepository = new TaxSettingsRepository(db);
  const vatRates = createVatRateResolver(taxSettingsRepository, { cityRepository, regionRepository }, logger);
  // Electronic invoicing (feature 023): providers per country, credentials from Secret Manager.
  const invoicingDocumentRepository = new InvoicingDocumentRepository(db);
  await invoicingDocumentRepository.ensureIndexes();
  const invoicingSettingsRepository = new InvoicingSettingsRepository(db);
  const billableMovementScanner = new BillableMovementScanner(db);
  const invoicingProviders = new InvoicingProviderRegistry([new SiigoInvoicingProvider(config.invoicing.siigoBaseUrl)]);
  const invoicingSecrets = new EnvInvoicingSecrets(process.env);
  // Wallet top-ups (feature 022). Secrets come from the environment (Secret Manager), never the database.
  const topUpRepository = new TopUpRepository(db);
  await topUpRepository.ensureIndexes();
  const paymentGatewaySettingsRepository = new PaymentGatewaySettingsRepository(db);
  const paymentGatewayRegistry = new PaymentGatewayRegistry([new WompiGateway()]);
  const paymentSecrets = new EnvPaymentSecrets(process.env);

  const imageStorageProvider = new CloudinaryImageStorageProvider({
    cloudinaryUrl: config.images.cloudinaryUrl,
  });

  const googleValidator = new GoogleIdTokenValidator({
    mobile: [config.google.clientIdMobile, config.google.clientIdAndroidServer],
    'admin-web': [config.google.clientIdWeb],
  });
  const tokenIssuer = new JwtInternalTokenIssuer({
    signingKey: config.jwt.signingKey,
    accessTokenLifetimeMinutes: config.jwt.accessTokenLifetimeMinutes,
    refreshTokenLifetimeDays: config.jwt.refreshTokenLifetimeDays,
  });
  const ssoCatalog = new GoogleSsoProviderCatalog({
    clientIdMobile: config.google.clientIdMobile,
    clientIdWeb: config.google.clientIdWeb,
    clientIdAndroidServer: config.google.clientIdAndroidServer,
    scopes: DEFAULT_GOOGLE_SCOPES,
  });
  const auditLogger = new PinoAuditLogger();
  const idGenerator = new UuidIdGenerator();
  const clock = new SystemClock();
  const walletStore = new MongoWalletStore(() => connectionProvider.startSession(), db, () => clock.now());
  const walletLedger = new WalletLedger(walletStore, walletMovementRepository, idGenerator, clock);
  const topUpStore = new MongoTopUpStore(() => connectionProvider.startSession(), db, () => idGenerator.newId());
  const refreshTokenLifetimeMs = config.jwt.refreshTokenLifetimeDays * 24 * 60 * 60 * 1000;
  const mongoHealthCheck = new MongoHealthCheck(db);

  const mediator = new Mediator();

  // Domain events (feature 013).
  assertEventsConfig();
  const outboxStore = new MongoOutboxStore(db);
  await outboxStore.ensureIndexes();
  const eventPublisher =
    config.events.mode === 'pubsub'
      ? new PubSubEventPublisher(config.events.gcpProjectId(), config.events.topic)
      : new InProcessEventPublisher(mediator);
  const eventRelay = new EventRelay(eventPublisher, outboxStore, clock, logger, config.events.relayTimeoutMs);
  const jobLockStore = new MongoJobLockStore(db);
  const processedEventStore = new MongoProcessedEventStore(db);
  await processedEventStore.ensureIndexes();
  const eventDeliveryLog = new MongoEventDeliveryLog(db);
  await eventDeliveryLog.ensureIndexes();
  const deliveryLogHandler = new LogEventDeliveryHandler(eventDeliveryLog, processedEventStore, clock, logger);
  registerSubscribers(
    mediator,
    DELIVERY_LOG_EVENT_TYPES.map((type) => ({ type, handler: deliveryLogHandler })),
  );
  // Invoicing (feature 023): a separate consumer of billing events, plus the issuer sweep job.
  const invoicingDeps = {
    documents: invoicingDocumentRepository,
    settings: invoicingSettingsRepository,
    providers: invoicingProviders,
    secrets: invoicingSecrets,
    countryLookup: countryRepository,
    cityRepository,
    logger,
    enabled: config.invoicing.enabled,
    movements: walletMovementRepository,
    users: userRepository,
    walletContext,
    idGenerator,
    clock,
  };
  const invoicingHandler = new CreateInvoicingDocumentHandler(invoicingDeps);
  registerSubscribers(
    mediator,
    BILLING_EVENT_TYPES.map((type) => ({ type, handler: invoicingHandler })),
  );
  const oidcVerifier = new GoogleOidcVerifier(config.internalAuth.audience, config.internalAuth.allowedInvokers);
  const verifyInternalCaller = async (token: string): Promise<boolean> => {
    const verdict = await oidcVerifier.verify(token);
    if (!verdict.ok) logger.warn({ outcome: 'internal_auth_rejected', reason: verdict.reason }, 'Internal call refused');
    return verdict.ok;
  };
  logger.info({ events_mode: config.events.mode }, 'Domain events configured');
  if (process.env.NODE_ENV === 'production' && config.events.mode === 'local') {
    logger.warn({ events_mode: 'local' }, 'Domain events run in-process in production: nothing reaches Pub/Sub');
  }

  // Push notifications (feature 014). `pushNotifier` is what 015 and 019 inject.
  assertPushConfig();
  const deviceRepository = new MongoDeviceRepository(db, config.push.inactivityDays);
  await deviceRepository.ensureIndexes();
  const pushSender =
    config.push.mode === 'fcm' ? new FcmPushSender(config.push.firebaseProjectId()) : new LoggingPushSender(logger);
  const pushNotifier = new PushNotifier({ devices: deviceRepository, sender: pushSender, logger, fingerprint: sha256TokenFingerprint });
  // Offers to eligible goalkeepers (feature 015).
  assertOffersConfig();
  const notificationRepository = new MongoNotificationRepository(db);
  await notificationRepository.ensureIndexes();
  const offerPushState = new MongoOfferPushStateStore(db);
  const offerEligibility = new OfferEligibilityService({ goalkeeperProfileRepository, walletRepository, commissionResolver, bookingRepository, vatRates });
  const offerSender = new OfferSender({
    notifications: notificationRepository,
    pushState: offerPushState,
    pushNotifier,
    idGenerator,
    requestRepository,
    zoneRepository,
    cityRepository,
    logger,
    maxReminders: config.offers.maxReminders,
    intervalMinutes: config.offers.reminderIntervalMinutes,
  });
  const offersHandler = new NotifyBookingOffersHandler(mediator, processedEventStore, clock);
  // Booking expiry and "cancel all" (feature 016).
  const lifecycleStore = new MongoBookingLifecycleStore(() => connectionProvider.startSession(), db);
  const bookingExpiryJob = new BookingExpiryJob({ bookingRepository, store: lifecycleStore, relay: eventRelay, idGenerator, logger });
  const clientOutcomeNotices = new ClientOutcomeNoticeHandler({
    requestRepository,
    bookingRepository,
    zoneRepository,
    cityRepository,
    notifications: notificationRepository,
    pushNotifier,
    processed: processedEventStore,
    idGenerator,
    clock,
    logger,
  });
  const cancelAllJob = new CancelAllJob({
    requestRepository,
    bookingRepository,
    store: lifecycleStore,
    walletContext,
    relay: eventRelay,
    idGenerator: idGenerator,
    logger: logger,
  });
  const goalkeeperCancellationNotices = new GoalkeeperCancellationNoticeHandler({
    requestRepository,
    zoneRepository,
    cityRepository,
    notifications: notificationRepository,
    pushNotifier,
    processed: processedEventStore,
    idGenerator: idGenerator,
    clock,
    logger: logger,
  });
  registerSubscribers(
    mediator,
    GOALKEEPER_CANCELLATION_EVENT_TYPES.map((type) => ({ type, handler: goalkeeperCancellationNotices })),
  );
  registerSubscribers(
    mediator,
    CLIENT_OUTCOME_EVENT_TYPES.map((type) => ({ type, handler: clientOutcomeNotices })),
  );
  // Withdrawal notices to the client and the suspended goalkeeper (feature 018).
  const withdrawalNotices = new WithdrawalNoticeHandler({
    requestRepository,
    zoneRepository,
    cityRepository,
    notifications: notificationRepository,
    pushNotifier,
    processed: processedEventStore,
    idGenerator,
    clock,
    logger,
  });
  registerSubscribers(
    mediator,
    WITHDRAWAL_NOTICE_EVENT_TYPES.map((type) => ({ type, handler: withdrawalNotices })),
  );
  // "Your goalkeeper arrived" to the client (feature 020).
  registerSubscribers(
    mediator,
    CHECK_IN_NOTICE_EVENT_TYPES.map((type) => ({
      type,
      handler: new CheckInNoticeHandler({
        requestRepository,
        zoneRepository,
        cityRepository,
        notifications: notificationRepository,
        pushNotifier,
        processed: processedEventStore,
        idGenerator: idGenerator,
        clock,
        logger: logger,
      }),
    })),
  );
  // The no-show notice to the goalkeeper (feature 021).
  registerSubscribers(
    mediator,
    NO_SHOW_NOTICE_EVENT_TYPES.map((type) => ({
      type,
      handler: new NoShowNoticeHandler({
        requestRepository,
        zoneRepository,
        cityRepository,
        notifications: notificationRepository,
        pushNotifier,
        processed: processedEventStore,
        idGenerator: idGenerator,
        clock,
        logger: logger,
      }),
    })),
  );
  // Assignment and completion notices to the client (feature 019).
  const clientAssignmentNotices = new ClientAssignmentNoticeHandler({
      requestRepository,
      bookingRepository,
      userRepository,
      zoneRepository,
      cityRepository,
      notifications: notificationRepository,
      pushNotifier,
      processed: processedEventStore,
      idGenerator: idGenerator,
      clock,
      logger: logger,
    });
  registerSubscribers(
    mediator,
    CLIENT_ASSIGNMENT_EVENT_TYPES.map((type) => ({ type, handler: clientAssignmentNotices })),
  );
  registerSubscribers(
    mediator,
    OFFER_EVENT_TYPES.map((type) => ({ type, handler: offersHandler })),
  );
  logger.info({ push_mode: config.push.mode }, 'Push notifications configured');
  if (process.env.NODE_ENV === 'production' && config.push.mode === 'log') {
    logger.warn({ push_mode: 'log' }, 'Push notifications are only logged in production: nothing reaches devices');
  }

  registerHandlers(mediator, [
    { requestType: GetSsoOptionsQuery, handler: new GetSsoOptionsQueryHandler(ssoCatalog) },
    {
      requestType: ExchangeSsoCredentialCommand,
      handler: new ExchangeSsoCredentialCommandHandler(
        googleValidator,
        userRepository,
        refreshTokenRepository,
        tokenIssuer,
        goalkeeperProfileRepository,
        idGenerator,
        auditLogger,
        refreshTokenLifetimeMs,
      ),
    },
    {
      requestType: RefreshAccessTokenCommand,
      handler: new RefreshAccessTokenCommandHandler(
        refreshTokenRepository,
        userRepository,
        tokenIssuer,
        goalkeeperProfileRepository,
        idGenerator,
        refreshTokenLifetimeMs,
      ),
    },
    {
      requestType: CompleteProfileCommand,
      handler: new CompleteProfileCommandHandler(
        userRepository,
        countryRepository,
        termsAcceptanceRepository,
        tokenIssuer,
        goalkeeperProfileRepository,
        idGenerator,
        { termsVersion: config.legal.termsVersion, privacyPolicyVersion: config.legal.privacyPolicyVersion },
      ),
    },
    { requestType: GetClientProfileQuery, handler: new GetClientProfileQueryHandler(userRepository) },
    {
      requestType: UpdateClientProfileCommand,
      handler: new UpdateClientProfileCommandHandler(userRepository, countryRepository),
    },
    { requestType: GetCountriesQuery, handler: new GetCountriesQueryHandler(countryRepository) },
    {
      requestType: GetCitiesQuery,
      handler: new GetCitiesQueryHandler(cityRepository, regionRepository, zoneRepository),
    },
    { requestType: GetZonesByCityQuery, handler: new GetZonesByCityQueryHandler(cityRepository, zoneRepository) },
    {
      requestType: GetBookingConfigQuery,
      handler: new GetBookingConfigQueryHandler(
        zoneRepository,
        cityRepository,
        regionRepository,
        countryRepository,
        bookingSettingsRepository,
        clock,
      ),
    },
    {
      requestType: GetServiceQuoteQuery,
      handler: new GetServiceQuoteQueryHandler(
        zoneRepository,
        cityRepository,
        regionRepository,
        countryRepository,
        rentalRateRepository,
        bookingSettingsRepository,
        commissionResolver,
        clock,
      ),
    },
    {
      requestType: IssueServiceQuoteCommand,
      handler: new IssueServiceQuoteCommandHandler(mediator, quoteRepository, idGenerator, clock),
    },
    {
      requestType: ConfirmBookingCommand,
      handler: new ConfirmBookingCommandHandler(
        requestRepository,
        bookingRepository,
        userRepository,
        quoteRepository,
        quoteConfirmationStore,
        idGenerator,
        clock,
        auditLogger,
        eventRelay,
      ),
    },
    {
      requestType: ListClientRequestsQuery,
      handler: new ListClientRequestsQueryHandler(
        requestRepository,
        bookingRepository,
        zoneRepository,
        cityRepository,
        userRepository,
        clock,
      ),
    },
    {
      requestType: StoreImageCommand,
      handler: new StoreImageCommandHandler(imageStorageProvider, imageRepository, idGenerator),
    },
    { requestType: ResolveImageQuery, handler: new ResolveImageQueryHandler(imageRepository) },
    {
      requestType: DeleteImageCommand,
      handler: new DeleteImageCommandHandler(imageStorageProvider, imageRepository),
    },
    {
      requestType: GetGoalkeeperWalletQuery,
      handler: new GetGoalkeeperWalletQueryHandler(walletContext, walletRepository, commissionResolver, clock, vatRates),
    },
    {
      requestType: GetTopUpOptionsQuery,
      handler: new GetTopUpOptionsQueryHandler(walletContext, paymentGatewaySettingsRepository, termsAcceptanceRepository, config.legal),
    },
    {
      requestType: StartTopUpCommand,
      handler: new StartTopUpCommandHandler({
        context: walletContext,
        settingsRepository: paymentGatewaySettingsRepository,
        termsRepository: termsAcceptanceRepository,
        gateways: paymentGatewayRegistry,
        secrets: paymentSecrets,
        topUpRepository,
        idGenerator,
        clock,
        logger,
        settings: { termsVersion: config.legal.termsVersion, publicBaseUrl: config.payments.publicBaseUrl },
      }),
    },
    {
      requestType: ApplyGatewayEventCommand,
      handler: new ApplyGatewayEventCommandHandler({
        walletContext,
        store: topUpStore,
        notices: { notifications: notificationRepository, pushNotifier, idGenerator: idGenerator, clock },
        logger: logger,
        gateways: paymentGatewayRegistry,
        secrets: paymentSecrets,
        topUpRepository,
        countryLookup: countryRepository,
        clock,
      }),
    },
    { requestType: ListTopUpsQuery, handler: new ListTopUpsQueryHandler(goalkeeperProfileRepository, topUpRepository) },
    { requestType: GetTopUpQuery, handler: new GetTopUpQueryHandler(topUpRepository) },
    { requestType: GetTopUpByReferenceQuery, handler: new GetTopUpByReferenceQueryHandler(topUpRepository) },
    {
      requestType: SetGatewaySettingsCommand,
      handler: new SetGatewaySettingsCommandHandler(countryRepository, paymentGatewaySettingsRepository, clock, logger),
    },
    { requestType: GetGatewaySettingsQuery, handler: new GetGatewaySettingsQueryHandler(paymentGatewaySettingsRepository) },
    { requestType: ListMyDocumentsQuery, handler: new ListMyDocumentsQueryHandler(goalkeeperProfileRepository, invoicingDocumentRepository) },
    { requestType: GetMyDocumentQuery, handler: new GetMyDocumentQueryHandler(invoicingDocumentRepository) },
    { requestType: GetDocumentFileQuery, handler: new GetDocumentFileQueryHandler(invoicingDeps) },
    {
      requestType: SetTaxSettingsCommand,
      handler: new SetTaxSettingsCommandHandler(countryRepository, taxSettingsRepository, clock, invoicingDeps.logger),
    },
    { requestType: GetTaxSettingsQuery, handler: new GetTaxSettingsQueryHandler(taxSettingsRepository) },
    {
      requestType: SetInvoicingSettingsCommand,
      handler: new SetInvoicingSettingsCommandHandler(countryRepository, invoicingSettingsRepository, invoicingDeps.secrets, clock, invoicingDeps.logger),
    },
    { requestType: GetInvoicingSettingsQuery, handler: new GetInvoicingSettingsQueryHandler(invoicingSettingsRepository, invoicingDeps.secrets, countryRepository) },
    { requestType: ListDocumentsForAdminQuery, handler: new ListDocumentsForAdminQueryHandler(invoicingDocumentRepository, clock) },
    {
      requestType: RetryDocumentCommand,
      handler: new RetryDocumentCommandHandler({ ...invoicingDeps, profiles: goalkeeperProfileRepository }),
    },
    {
      requestType: AcceptCurrentTermsCommand,
      handler: new AcceptCurrentTermsCommandHandler(termsAcceptanceRepository, idGenerator, clock, config.legal),
    },
    {
      requestType: RecordWalletAdjustmentCommand,
      handler: new RecordWalletAdjustmentCommandHandler(walletContext, walletLedger, walletRepository, {
        notifications: notificationRepository,
        pushNotifier,
        idGenerator,
        clock,
      }),
    },
    {
      requestType: AcceptBookingCommand,
      handler: new AcceptBookingCommandHandler({
        walletContext,
        walletRepository: walletRepository,
        bookingRepository,
        requestRepository,
        zoneRepository,
        cityRepository,
        userRepository,
        store: new MongoBookingAcceptanceStore(() => connectionProvider.startSession(), db),
        idGenerator: idGenerator,
        clock,
        audit: auditLogger,
        relay: eventRelay,
        vatRates,
      }),
    },
    {
      requestType: ListAvailableBookingsQuery,
      handler: new ListAvailableBookingsQueryHandler({
        vatRates,
        goalkeeperProfileRepository,
        walletRepository: walletRepository,
        commissionResolver,
        bookingRepository,
        requestRepository: requestRepository,
        zoneRepository,
        cityRepository,
        clock,
        onCapReached: (goalkeeperId) =>
          logger.warn({ outcome: 'available_candidates_cap_reached', goalkeeperId }, 'Available-bookings candidate cap reached'),
      }),
    },
    {
      requestType: ListGoalkeeperAgendaQuery,
      handler: new ListGoalkeeperAgendaQueryHandler({
        goalkeeperProfileRepository,
        bookingRepository,
        requestRepository,
        zoneRepository,
        cityRepository,
        userRepository,
        clock,
      }),
    },
    {
      requestType: ListWalletMovementsQuery,
      handler: new ListWalletMovementsQueryHandler(goalkeeperProfileRepository, walletRepository, walletMovementRepository),
    },
    {
      requestType: GetGoalkeeperRegistrationQuery,
      handler: new GetGoalkeeperRegistrationQueryHandler(
        goalkeeperRegistrationRepository,
        goalkeeperProfileRepository,
        cityRepository,
        regionRepository,
      ),
    },
    { requestType: GetDocumentTypesQuery, handler: new GetDocumentTypesQueryHandler(documentTypeRepository) },
    {
      requestType: SaveIdentificationSectionCommand,
      handler: new SaveIdentificationSectionCommandHandler(goalkeeperRegistrationRepository, documentTypeRepository, idGenerator),
    },
    {
      requestType: SavePhysicalDataSectionCommand,
      handler: new SavePhysicalDataSectionCommandHandler(goalkeeperRegistrationRepository, idGenerator),
    },
    {
      requestType: SaveAvailabilitySectionCommand,
      handler: new SaveAvailabilitySectionCommandHandler(goalkeeperRegistrationRepository, cityRepository, zoneRepository, idGenerator),
    },
    {
      requestType: SaveDocumentPhotoCommand,
      handler: new SaveDocumentPhotoCommandHandler(mediator, goalkeeperRegistrationRepository, idGenerator),
    },
    {
      requestType: ActivateGoalkeeperCommand,
      handler: new ActivateGoalkeeperCommandHandler(goalkeeperRegistrationRepository, goalkeeperProfileRepository, idGenerator),
    },
    {
      requestType: UpdateGoalkeeperPhysicalDataCommand,
      handler: new UpdateGoalkeeperPhysicalDataCommandHandler(goalkeeperProfileRepository, goalkeeperRegistrationRepository),
    },
    {
      requestType: UpdateGoalkeeperAvailabilityCommand,
      handler: new UpdateGoalkeeperAvailabilityCommandHandler(
        goalkeeperProfileRepository,
        goalkeeperRegistrationRepository,
        cityRepository,
        zoneRepository,
      ),
    },
    {
      requestType: RunSweepCommand,
      handler: new RunSweepCommandHandler({
        outbox: outboxStore,
        publisher: eventPublisher,
        clock,
        logger,
        batchLimit: config.events.sweepBatchLimit,
        pendingWarningMinutes: config.events.pendingWarningMinutes,
        jobs: [
          cancelAllJob,
          bookingExpiryJob,
          new BookingCompletionJob({ bookingRepository, store: lifecycleStore, relay: eventRelay, idGenerator, logger }),
          new NoShowWatchJob({
            walletContext,
            bookingSettingsRepository,
            logger: logger,
            bookingRepository,
            requestRepository,
            store: lifecycleStore,
            relay: eventRelay,
            idGenerator: idGenerator,
            clock,
            graceResolver: () => createNoShowGraceResolver({ cityRepository, regionRepository, bookingSettingsRepository, logger: logger }),
          }),
          new OfferRemindersJob({ bookingRepository, eligibility: offerEligibility, sender: offerSender, logger: logger, roundCap: config.offers.roundCap }),
          new ContactsRevealJob({
            requestRepository,
            bookingRepository,
            userRepository,
            zoneRepository,
            cityRepository,
            notifications: notificationRepository,
            pushNotifier,
            idGenerator: idGenerator,
            clock,
            logger: logger,
          }),
          new CheckInWatchJob({
            bookingRepository,
            requestRepository,
            userRepository,
            zoneRepository,
            cityRepository,
            notifications: notificationRepository,
            pushNotifier,
            idGenerator: idGenerator,
            clock,
            logger: logger,
            windowResolver: () => createCheckInWindowResolver({ cityRepository, regionRepository, bookingSettingsRepository, logger: logger }),
          }),
          new TopUpReconcileJob({
            walletContext,
            store: topUpStore,
            notices: { notifications: notificationRepository, pushNotifier, idGenerator: idGenerator, clock },
            logger: logger,
            topUpRepository,
            gateways: paymentGatewayRegistry,
            secrets: paymentSecrets,
            countryLookup: countryRepository,
          }),
          new InvoicingIssuerJob({ ...invoicingDeps, scanner: billableMovementScanner, cap: config.invoicing.issuerCap }),
        ],
        jobLocks: jobLockStore,
      }),
    },
    {
      requestType: SetOffersAvailabilityCommand,
      handler: new SetOffersAvailabilityCommandHandler({ goalkeeperProfileRepository, eligibility: offerEligibility, sender: offerSender, clock, logger }),
    },
    {
      requestType: ListNotificationsQuery,
      handler: new ListNotificationsQueryHandler({ notifications: notificationRepository, eligibility: offerEligibility, clock }),
    },
    { requestType: MarkNotificationReadCommand, handler: new MarkNotificationReadCommandHandler(notificationRepository, clock) },
    { requestType: MarkAllNotificationsReadCommand, handler: new MarkAllNotificationsReadCommandHandler(notificationRepository, clock) },
    { requestType: DismissOfferCommand, handler: new DismissOfferCommandHandler(notificationRepository, clock) },
    {
      requestType: CancelBookingsByClientCommand,
      handler: new CancelBookingsByClientCommandHandler({
        requestRepository,
        bookingRepository,
        userRepository,
        store: lifecycleStore,
        walletContext,
        relay: eventRelay,
        idGenerator: idGenerator,
        clock,
        audit: auditLogger,
        logger: logger,
      }),
    },
    {
      requestType: ListGoalkeeperWithdrawalsQuery,
      handler: new ListGoalkeeperWithdrawalsQueryHandler({ goalkeeperProfileRepository, incidents: goalkeeperIncidentRepository, clock }),
    },
    {
      requestType: ReverseWithdrawalPenaltyCommand,
      handler: new ReverseWithdrawalPenaltyCommandHandler({ walletContext, store: lifecycleStore, idGenerator: idGenerator, clock, audit: auditLogger, logger: logger }),
    },
    {
      requestType: CheckInToBookingCommand,
      handler: new CheckInToBookingCommandHandler({
        goalkeeperProfileRepository,
        imageRepository,
        bookingRepository,
        requestRepository,
        zoneRepository,
        cityRepository,
        userRepository,
        windowResolver: () => createCheckInWindowResolver({ cityRepository, regionRepository, bookingSettingsRepository, logger: logger }),
        store: lifecycleStore,
        relay: eventRelay,
        idGenerator: idGenerator,
        clock,
        audit: auditLogger,
      }),
    },
    {
      requestType: RateBookingCommand,
      handler: new RateBookingCommandHandler({
        walletContext,
        bookingSettingsRepository,
        logger: logger,
        bookingRepository,
        store: lifecycleStore,
        relay: eventRelay,
        idGenerator: idGenerator,
        clock,
        audit: auditLogger,
      }),
    },
    {
      requestType: ListPendingRatingsQuery,
      handler: new ListPendingRatingsQueryHandler({ bookingRepository, ratingRepository: ratingRepository, requestRepository, zoneRepository, cityRepository, userRepository, clock }),
    },
    { requestType: ListCasesQuery, handler: new ListCasesQueryHandler(caseRepository) },
    { requestType: GetCaseQuery, handler: new GetCaseQueryHandler(caseRepository, ratingRepository) },
    { requestType: ResolveCaseCommand, handler: new ResolveCaseCommandHandler(caseRepository, ratingRepository, clock, auditLogger) },
    {
      requestType: WithdrawFromBookingCommand,
      handler: new WithdrawFromBookingCommandHandler({
        walletContext,
        bookingSettingsRepository,
        store: lifecycleStore,
        bookingRepository,
        requestRepository,
        zoneRepository,
        cityRepository,
        relay: eventRelay,
        idGenerator,
        clock,
        audit: auditLogger,
        logger,
      }),
    },
    {
      requestType: NotifyBookingOffersCommand,
      handler: new NotifyBookingOffersCommandHandler({ bookingRepository, eligibility: offerEligibility, sender: offerSender, clock, logger }),
    },
    {
      requestType: RegisterDeviceCommand,
      handler: new RegisterDeviceCommandHandler({
        devices: deviceRepository,
        clock,
        logger,
        fingerprint: sha256TokenFingerprint,
        maxDevicesPerUser: config.push.maxDevicesPerUser,
      }),
    },
    {
      requestType: UnregisterDeviceCommand,
      handler: new UnregisterDeviceCommandHandler({ devices: deviceRepository, logger, fingerprint: sha256TokenFingerprint }),
    },
    {
      requestType: SendTestPushCommand,
      handler: new SendTestPushCommandHandler({
        notifier: pushNotifier,
        limiter: new InMemoryRateLimiter(),
        clock,
        limitPerMinute: config.push.testLimitPerMinute,
      }),
    },
    {
      requestType: CancelGoalkeeperRegistrationCommand,
      handler: new CancelGoalkeeperRegistrationCommandHandler(mediator, goalkeeperRegistrationRepository),
    },
  ]);

  return {
    dependencies: {
      mediator,
      verifyAccessToken: (token) => tokenIssuer.verifyAccessToken(token),
      checkHealth: () => mongoHealthCheck.check(),
      publisher: mediator,
      verifyInternalCaller,
      paymentReturn: {
        appOpenUrl: config.payments.appOpenUrl,
        androidPackage: config.payments.androidPackage,
        androidCertSha256: config.payments.androidCertSha256,
        iosAppId: config.payments.iosAppId,
      },
    },
    close: async () => {
      await connectionProvider.close();
    },
  };
}
