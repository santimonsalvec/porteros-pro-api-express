import type { Server } from 'node:http';
import { v7 as uuidv7 } from 'uuid';
import { createApp } from '../../src/app.js';
import { listenOnLoopback } from './testServers.js';
import type { AppDependencies } from '../../src/appDependencies.js';
import { Mediator, registerHandlers, registerSubscribers } from '../../src/application/common/mediator/mediator.js';
import { DELIVERY_LOG_EVENT_TYPES, LogEventDeliveryHandler } from '../../src/application/features/events/handlers/logEventDelivery.js';
import { InProcessEventPublisher } from '../../src/infrastructure/events/inProcessEventPublisher.js';
import { FakeEventDeliveryLog } from '../fakes/fakeEventDeliveryLog.js';
import { FakeProcessedEventStore } from '../fakes/fakeProcessedEventStore.js';
import { FakeOutboxStore } from '../fakes/fakeOutboxStore.js';
import { FakeEventPublisher } from '../fakes/fakeEventPublisher.js';
import { FakeJobLockStore } from '../fakes/fakeJobLockStore.js';
import { EventRelay } from '../../src/application/features/events/common/eventRelay.js';
import { RunSweepCommand } from '../../src/application/features/events/commands/runSweep/runSweepCommand.js';
import { RunSweepCommandHandler } from '../../src/application/features/events/commands/runSweep/runSweepCommandHandler.js';
import { GetSsoOptionsQuery } from '../../src/application/features/auth/queries/getSsoOptions/getSsoOptionsQuery.js';
import { GetSsoOptionsQueryHandler } from '../../src/application/features/auth/queries/getSsoOptions/getSsoOptionsQueryHandler.js';
import { ExchangeSsoCredentialCommand } from '../../src/application/features/auth/commands/exchangeSsoCredential/exchangeSsoCredentialCommand.js';
import { ExchangeSsoCredentialCommandHandler } from '../../src/application/features/auth/commands/exchangeSsoCredential/exchangeSsoCredentialCommandHandler.js';
import { RefreshAccessTokenCommand } from '../../src/application/features/auth/commands/refreshAccessToken/refreshAccessTokenCommand.js';
import { RefreshAccessTokenCommandHandler } from '../../src/application/features/auth/commands/refreshAccessToken/refreshAccessTokenCommandHandler.js';
import type { ISsoProviderCatalog } from '../../src/application/features/auth/common/ports.js';
import { CompleteProfileCommand } from '../../src/application/features/profile/commands/completeProfile/completeProfileCommand.js';
import { CompleteProfileCommandHandler } from '../../src/application/features/profile/commands/completeProfile/completeProfileCommandHandler.js';
import { Country } from '../../src/domain/countries/country.js';
import { FakeUserRepository } from '../fakes/fakeUserRepository.js';
import { FakeRefreshTokenRepository } from '../fakes/fakeRefreshTokenRepository.js';
import { FakeGoogleIdTokenValidator } from '../fakes/fakeGoogleIdTokenValidator.js';
import { FakeInternalTokenIssuer } from '../fakes/fakeInternalTokenIssuer.js';
import { FakeCountryRepository } from '../fakes/fakeCountryRepository.js';
import { FakeTermsAcceptanceRepository } from '../fakes/fakeTermsAcceptanceRepository.js';
import { GetClientProfileQuery } from '../../src/application/features/clients/queries/getClientProfile/getClientProfileQuery.js';
import { GetClientProfileQueryHandler } from '../../src/application/features/clients/queries/getClientProfile/getClientProfileQueryHandler.js';
import { UpdateClientProfileCommand } from '../../src/application/features/clients/commands/updateClientProfile/updateClientProfileCommand.js';
import { UpdateClientProfileCommandHandler } from '../../src/application/features/clients/commands/updateClientProfile/updateClientProfileCommandHandler.js';
import { GetCountriesQuery } from '../../src/application/features/locations/queries/getCountries/getCountriesQuery.js';
import { GetCountriesQueryHandler } from '../../src/application/features/locations/queries/getCountries/getCountriesQueryHandler.js';
import { GetCitiesQuery } from '../../src/application/features/locations/queries/getCities/getCitiesQuery.js';
import { GetCitiesQueryHandler } from '../../src/application/features/locations/queries/getCities/getCitiesQueryHandler.js';
import { IssueServiceQuoteCommand } from '../../src/application/features/goalkeeperRequests/commands/issueServiceQuote/issueServiceQuoteCommand.js';
import { IssueServiceQuoteCommandHandler } from '../../src/application/features/goalkeeperRequests/commands/issueServiceQuote/issueServiceQuoteCommandHandler.js';
import { FakeQuoteRepository } from '../fakes/fakeQuoteRepository.js';
import { FakeGoalkeeperRequestRepository } from '../fakes/fakeGoalkeeperRequestRepository.js';
import { FakeBookingRepository } from '../fakes/fakeBookingRepository.js';
import { FakeWalletStore } from '../fakes/fakeWalletStore.js';
import { FakeCommissionSettingRepository } from '../fakes/fakeCommissionSettingRepository.js';
import { CommissionResolver } from '../../src/application/features/wallet/common/commissionResolver.js';
import { WalletLedger } from '../../src/application/features/wallet/common/walletLedger.js';
import { ListAvailableBookingsQuery } from '../../src/application/features/goalkeeperRequests/queries/listAvailableBookings/listAvailableBookingsQuery.js';
import { ListGoalkeeperAgendaQuery } from '../../src/application/features/goalkeeperRequests/queries/listGoalkeeperAgenda/listGoalkeeperAgendaQuery.js';
import { ListGoalkeeperAgendaQueryHandler } from '../../src/application/features/goalkeeperRequests/queries/listGoalkeeperAgenda/listGoalkeeperAgendaQueryHandler.js';
import { AcceptBookingCommand } from '../../src/application/features/goalkeeperRequests/commands/acceptBooking/acceptBookingCommand.js';
import { AcceptBookingCommandHandler } from '../../src/application/features/goalkeeperRequests/commands/acceptBooking/acceptBookingCommandHandler.js';
import { FakeBookingAcceptanceStore } from '../fakes/fakeBookingAcceptanceStore.js';
import { FakeAcceptanceAuditLogger } from '../fakes/fakeAcceptanceAuditLogger.js';
import { ListAvailableBookingsQueryHandler } from '../../src/application/features/goalkeeperRequests/queries/listAvailableBookings/listAvailableBookingsQueryHandler.js';
import { RecordWalletAdjustmentCommand } from '../../src/application/features/wallet/commands/recordWalletAdjustment/recordWalletAdjustmentCommand.js';
import { RecordWalletAdjustmentCommandHandler } from '../../src/application/features/wallet/commands/recordWalletAdjustment/recordWalletAdjustmentCommandHandler.js';
import { ApplyGatewayEventCommand } from '../../src/application/features/payments/commands/applyGatewayEvent/applyGatewayEventCommand.js';
import { ApplyGatewayEventCommandHandler } from '../../src/application/features/payments/commands/applyGatewayEvent/applyGatewayEventCommandHandler.js';
import { TopUpReconcileJob } from '../../src/application/features/payments/jobs/topUpReconcileJob.js';
import { ListTopUpsQuery } from '../../src/application/features/payments/queries/listTopUps/listTopUpsQuery.js';
import { ListTopUpsQueryHandler } from '../../src/application/features/payments/queries/listTopUps/listTopUpsQueryHandler.js';
import { GetTopUpQuery } from '../../src/application/features/payments/queries/getTopUp/getTopUpQuery.js';
import { GetTopUpQueryHandler } from '../../src/application/features/payments/queries/getTopUp/getTopUpQueryHandler.js';
import { GetTopUpByReferenceQuery } from '../../src/application/features/payments/queries/getTopUpByReference/getTopUpByReferenceQuery.js';
import { GetTopUpByReferenceQueryHandler } from '../../src/application/features/payments/queries/getTopUpByReference/getTopUpByReferenceQueryHandler.js';
import { SetGatewaySettingsCommand } from '../../src/application/features/payments/commands/setGatewaySettings/setGatewaySettingsCommand.js';
import { SetGatewaySettingsCommandHandler } from '../../src/application/features/payments/commands/setGatewaySettings/setGatewaySettingsCommandHandler.js';
import { GetGatewaySettingsQuery } from '../../src/application/features/payments/queries/getGatewaySettings/getGatewaySettingsQuery.js';
import { GetGatewaySettingsQueryHandler } from '../../src/application/features/payments/queries/getGatewaySettings/getGatewaySettingsQueryHandler.js';
import type { PaymentReturnSettings } from '../../src/controllers/paymentReturnController.js';
import { FakeTaxSettingsRepository } from '../fakes/fakeTaxSettingsRepository.js';
import { createVatRateResolver } from '../../src/application/features/wallet/common/vatRateResolver.js';
import { CreateInvoicingDocumentHandler } from '../../src/application/features/invoicing/handlers/createInvoicingDocument.js';
import { InvoicingIssuerJob } from '../../src/application/features/invoicing/jobs/invoicingIssuerJob.js';
import { BILLING_EVENT_TYPES } from '../../src/domain/events/billingEvents.js';
import { FakeInvoicingProvider, FakeInvoicingProviderRegistry } from '../fakes/fakeInvoicingProvider.js';
import { FakeInvoicingSecrets } from '../fakes/fakeInvoicingSecrets.js';
import { FakeInvoicingSettingsRepository } from '../fakes/fakeInvoicingSettingsRepository.js';
import { FakeInvoicingDocumentRepository } from '../fakes/fakeInvoicingDocumentRepository.js';
import { FakeBillableMovementScanner } from '../fakes/fakeBillableMovementScanner.js';
import { ListMyDocumentsQuery } from '../../src/application/features/invoicing/queries/listMyDocuments/listMyDocumentsQuery.js';
import { ListMyDocumentsQueryHandler } from '../../src/application/features/invoicing/queries/listMyDocuments/listMyDocumentsQueryHandler.js';
import { GetMyDocumentQuery } from '../../src/application/features/invoicing/queries/getMyDocument/getMyDocumentQuery.js';
import { GetMyDocumentQueryHandler } from '../../src/application/features/invoicing/queries/getMyDocument/getMyDocumentQueryHandler.js';
import { GetDocumentFileQuery } from '../../src/application/features/invoicing/queries/getDocumentFile/getDocumentFileQuery.js';
import { GetDocumentFileQueryHandler } from '../../src/application/features/invoicing/queries/getDocumentFile/getDocumentFileQueryHandler.js';
import { SetTaxSettingsCommand } from '../../src/application/features/invoicing/commands/setTaxSettings/setTaxSettingsCommand.js';
import { SetTaxSettingsCommandHandler } from '../../src/application/features/invoicing/commands/setTaxSettings/setTaxSettingsCommandHandler.js';
import { GetTaxSettingsQuery } from '../../src/application/features/invoicing/queries/getTaxSettings/getTaxSettingsQuery.js';
import { GetTaxSettingsQueryHandler } from '../../src/application/features/invoicing/queries/getTaxSettings/getTaxSettingsQueryHandler.js';
import { SetInvoicingSettingsCommand } from '../../src/application/features/invoicing/commands/setInvoicingSettings/setInvoicingSettingsCommand.js';
import { SetInvoicingSettingsCommandHandler } from '../../src/application/features/invoicing/commands/setInvoicingSettings/setInvoicingSettingsCommandHandler.js';
import { GetInvoicingSettingsQuery } from '../../src/application/features/invoicing/queries/getInvoicingSettings/getInvoicingSettingsQuery.js';
import { GetInvoicingSettingsQueryHandler } from '../../src/application/features/invoicing/queries/getInvoicingSettings/getInvoicingSettingsQueryHandler.js';
import { ListDocumentsForAdminQuery } from '../../src/application/features/invoicing/queries/listDocumentsForAdmin/listDocumentsForAdminQuery.js';
import { ListDocumentsForAdminQueryHandler } from '../../src/application/features/invoicing/queries/listDocumentsForAdmin/listDocumentsForAdminQueryHandler.js';
import { RetryDocumentCommand } from '../../src/application/features/invoicing/commands/retryDocument/retryDocumentCommand.js';
import { RetryDocumentCommandHandler } from '../../src/application/features/invoicing/commands/retryDocument/retryDocumentCommandHandler.js';
import { GetTopUpOptionsQuery } from '../../src/application/features/payments/queries/getTopUpOptions/getTopUpOptionsQuery.js';
import { GetTopUpOptionsQueryHandler } from '../../src/application/features/payments/queries/getTopUpOptions/getTopUpOptionsQueryHandler.js';
import { StartTopUpCommand } from '../../src/application/features/payments/commands/startTopUp/startTopUpCommand.js';
import { StartTopUpCommandHandler } from '../../src/application/features/payments/commands/startTopUp/startTopUpCommandHandler.js';
import { AcceptCurrentTermsCommand } from '../../src/application/features/profile/commands/acceptCurrentTerms/acceptCurrentTermsCommand.js';
import { AcceptCurrentTermsCommandHandler } from '../../src/application/features/profile/commands/acceptCurrentTerms/acceptCurrentTermsCommandHandler.js';
import { FakePaymentGateway, FakePaymentGatewayRegistry } from '../fakes/fakePaymentGateway.js';
import { FakePaymentSecrets } from '../fakes/fakePaymentSecrets.js';
import { FakePaymentGatewaySettingsRepository } from '../fakes/fakePaymentGatewaySettingsRepository.js';
import { FakeTopUpRepository } from '../fakes/fakeTopUpRepository.js';
import { FakeTopUpStore } from '../fakes/fakeTopUpStore.js';
import { GetGoalkeeperWalletQuery } from '../../src/application/features/wallet/queries/getGoalkeeperWallet/getGoalkeeperWalletQuery.js';
import { GetGoalkeeperWalletQueryHandler } from '../../src/application/features/wallet/queries/getGoalkeeperWallet/getGoalkeeperWalletQueryHandler.js';
import { ListWalletMovementsQuery } from '../../src/application/features/wallet/queries/listWalletMovements/listWalletMovementsQuery.js';
import { ListWalletMovementsQueryHandler } from '../../src/application/features/wallet/queries/listWalletMovements/listWalletMovementsQueryHandler.js';
import { FakeQuoteConfirmationStore } from '../fakes/fakeQuoteConfirmationStore.js';
import { FakeBookingAuditLogger } from '../fakes/fakeBookingAuditLogger.js';
import { ConfirmBookingCommand } from '../../src/application/features/goalkeeperRequests/commands/confirmBooking/confirmBookingCommand.js';
import { ListClientRequestsQuery } from '../../src/application/features/goalkeeperRequests/queries/listClientRequests/listClientRequestsQuery.js';
import { ListClientRequestsQueryHandler } from '../../src/application/features/goalkeeperRequests/queries/listClientRequests/listClientRequestsQueryHandler.js';
import { ConfirmBookingCommandHandler } from '../../src/application/features/goalkeeperRequests/commands/confirmBooking/confirmBookingCommandHandler.js';
import { GetZonesByCityQuery } from '../../src/application/features/zones/queries/getZonesByCity/getZonesByCityQuery.js';
import { GetZonesByCityQueryHandler } from '../../src/application/features/zones/queries/getZonesByCity/getZonesByCityQueryHandler.js';
import { GetBookingConfigQuery } from '../../src/application/features/goalkeeperRequests/queries/getBookingConfig/getBookingConfigQuery.js';
import { GetBookingConfigQueryHandler } from '../../src/application/features/goalkeeperRequests/queries/getBookingConfig/getBookingConfigQueryHandler.js';
import { GetServiceQuoteQuery } from '../../src/application/features/goalkeeperRequests/queries/getServiceQuote/getServiceQuoteQuery.js';
import { GetServiceQuoteQueryHandler } from '../../src/application/features/goalkeeperRequests/queries/getServiceQuote/getServiceQuoteQueryHandler.js';
import { City } from '../../src/domain/locations/city.js';
import { Region } from '../../src/domain/locations/region.js';
import { Zone } from '../../src/domain/zones/zone.js';
import { FakeCityRepository } from '../fakes/fakeCityRepository.js';
import { FakeRegionRepository } from '../fakes/fakeRegionRepository.js';
import { FakeZoneRepository } from '../fakes/fakeZoneRepository.js';
import { FixedClock } from '../fakes/fakeClock.js';
import { FakeRentalRateRepository } from '../fakes/fakeRentalRateRepository.js';
import { FakeBookingSettingsRepository } from '../fakes/fakeBookingSettingsRepository.js';
import { QUOTE_NOW, seedQuoteWorld } from '../fixtures/quoteFixtures.js';
import { StoreImageCommand } from '../../src/application/features/images/commands/storeImage/storeImageCommand.js';
import { StoreImageCommandHandler } from '../../src/application/features/images/commands/storeImage/storeImageCommandHandler.js';
import { ResolveImageQuery } from '../../src/application/features/images/queries/resolveImage/resolveImageQuery.js';
import { ResolveImageQueryHandler } from '../../src/application/features/images/queries/resolveImage/resolveImageQueryHandler.js';
import { DeleteImageCommand } from '../../src/application/features/images/commands/deleteImage/deleteImageCommand.js';
import { DeleteImageCommandHandler } from '../../src/application/features/images/commands/deleteImage/deleteImageCommandHandler.js';
import type { HealthReportResponse } from '../../src/infrastructure/healthChecks/healthReport.js';
import { FakeImageStorageProvider } from '../fakes/fakeImageStorageProvider.js';
import { FakeImageRepository } from '../fakes/fakeImageRepository.js';
import { GetGoalkeeperRegistrationQuery } from '../../src/application/features/goalkeepers/queries/getGoalkeeperRegistration/getGoalkeeperRegistrationQuery.js';
import { GetGoalkeeperRegistrationQueryHandler } from '../../src/application/features/goalkeepers/queries/getGoalkeeperRegistration/getGoalkeeperRegistrationQueryHandler.js';
import { GetDocumentTypesQuery } from '../../src/application/features/goalkeepers/queries/getDocumentTypes/getDocumentTypesQuery.js';
import { GetDocumentTypesQueryHandler } from '../../src/application/features/goalkeepers/queries/getDocumentTypes/getDocumentTypesQueryHandler.js';
import { DocumentType } from '../../src/domain/goalkeepers/documentType.js';
import { FakeGoalkeeperRegistrationRepository } from '../fakes/fakeGoalkeeperRegistrationRepository.js';
import { FakeDocumentTypeRepository } from '../fakes/fakeDocumentTypeRepository.js';
import { SaveIdentificationSectionCommand } from '../../src/application/features/goalkeepers/commands/saveIdentificationSection/saveIdentificationSectionCommand.js';
import { SaveIdentificationSectionCommandHandler } from '../../src/application/features/goalkeepers/commands/saveIdentificationSection/saveIdentificationSectionCommandHandler.js';
import { SavePhysicalDataSectionCommand } from '../../src/application/features/goalkeepers/commands/savePhysicalDataSection/savePhysicalDataSectionCommand.js';
import { SavePhysicalDataSectionCommandHandler } from '../../src/application/features/goalkeepers/commands/savePhysicalDataSection/savePhysicalDataSectionCommandHandler.js';
import { SaveAvailabilitySectionCommand } from '../../src/application/features/goalkeepers/commands/saveAvailabilitySection/saveAvailabilitySectionCommand.js';
import { SaveAvailabilitySectionCommandHandler } from '../../src/application/features/goalkeepers/commands/saveAvailabilitySection/saveAvailabilitySectionCommandHandler.js';
import { SaveDocumentPhotoCommand } from '../../src/application/features/goalkeepers/commands/saveDocumentPhoto/saveDocumentPhotoCommand.js';
import { SaveDocumentPhotoCommandHandler } from '../../src/application/features/goalkeepers/commands/saveDocumentPhoto/saveDocumentPhotoCommandHandler.js';
import { ActivateGoalkeeperCommand } from '../../src/application/features/goalkeepers/commands/activateGoalkeeper/activateGoalkeeperCommand.js';
import { ActivateGoalkeeperCommandHandler } from '../../src/application/features/goalkeepers/commands/activateGoalkeeper/activateGoalkeeperCommandHandler.js';
import { FakeGoalkeeperProfileRepository } from '../fakes/fakeGoalkeeperProfileRepository.js';
import { UpdateGoalkeeperPhysicalDataCommand } from '../../src/application/features/goalkeepers/commands/updateGoalkeeperPhysicalData/updateGoalkeeperPhysicalDataCommand.js';
import { UpdateGoalkeeperPhysicalDataCommandHandler } from '../../src/application/features/goalkeepers/commands/updateGoalkeeperPhysicalData/updateGoalkeeperPhysicalDataCommandHandler.js';
import { UpdateGoalkeeperAvailabilityCommand } from '../../src/application/features/goalkeepers/commands/updateGoalkeeperAvailability/updateGoalkeeperAvailabilityCommand.js';
import { UpdateGoalkeeperAvailabilityCommandHandler } from '../../src/application/features/goalkeepers/commands/updateGoalkeeperAvailability/updateGoalkeeperAvailabilityCommandHandler.js';
import { CancelGoalkeeperRegistrationCommand } from '../../src/application/features/goalkeepers/commands/cancelGoalkeeperRegistration/cancelGoalkeeperRegistrationCommand.js';
import { CancelGoalkeeperRegistrationCommandHandler } from '../../src/application/features/goalkeepers/commands/cancelGoalkeeperRegistration/cancelGoalkeeperRegistrationCommandHandler.js';
import { RegisterDeviceCommand } from '../../src/application/features/devices/commands/registerDevice/registerDeviceCommand.js';
import { RegisterDeviceCommandHandler } from '../../src/application/features/devices/commands/registerDevice/registerDeviceCommandHandler.js';
import { UnregisterDeviceCommand } from '../../src/application/features/devices/commands/unregisterDevice/unregisterDeviceCommand.js';
import { UnregisterDeviceCommandHandler } from '../../src/application/features/devices/commands/unregisterDevice/unregisterDeviceCommandHandler.js';
import { SendTestPushCommand } from '../../src/application/features/devices/commands/sendTestPush/sendTestPushCommand.js';
import { SendTestPushCommandHandler } from '../../src/application/features/devices/commands/sendTestPush/sendTestPushCommandHandler.js';
import { PushNotifier } from '../../src/application/features/devices/common/pushNotifier.js';
import { InMemoryRateLimiter } from '../../src/infrastructure/push/inMemoryRateLimiter.js';
import { sha256TokenFingerprint } from '../../src/infrastructure/push/tokenRef.js';
import { FakeDeviceRepository } from '../fakes/fakeDeviceRepository.js';
import { FakePushSender } from '../fakes/fakePushSender.js';
import { OfferEligibilityService } from '../../src/application/features/notifications/common/offerEligibilityService.js';
import { OfferSender } from '../../src/application/features/notifications/common/offerSender.js';
import { NotifyBookingOffersCommand } from '../../src/application/features/notifications/commands/notifyBookingOffers/notifyBookingOffersCommand.js';
import { NotifyBookingOffersCommandHandler } from '../../src/application/features/notifications/commands/notifyBookingOffers/notifyBookingOffersCommandHandler.js';
import { SetOffersAvailabilityCommand } from '../../src/application/features/notifications/commands/setOffersAvailability/setOffersAvailabilityCommand.js';
import { SetOffersAvailabilityCommandHandler } from '../../src/application/features/notifications/commands/setOffersAvailability/setOffersAvailabilityCommandHandler.js';
import { OfferRemindersJob } from '../../src/application/features/notifications/jobs/offerRemindersJob.js';
import { ListNotificationsQuery } from '../../src/application/features/notifications/queries/listNotifications/listNotificationsQuery.js';
import { ListNotificationsQueryHandler } from '../../src/application/features/notifications/queries/listNotifications/listNotificationsQueryHandler.js';
import { MarkNotificationReadCommand } from '../../src/application/features/notifications/commands/markNotificationRead/markNotificationReadCommand.js';
import { MarkNotificationReadCommandHandler } from '../../src/application/features/notifications/commands/markNotificationRead/markNotificationReadCommandHandler.js';
import { MarkAllNotificationsReadCommand } from '../../src/application/features/notifications/commands/markAllNotificationsRead/markAllNotificationsReadCommand.js';
import { MarkAllNotificationsReadCommandHandler } from '../../src/application/features/notifications/commands/markAllNotificationsRead/markAllNotificationsReadCommandHandler.js';
import { DismissOfferCommand } from '../../src/application/features/notifications/commands/dismissOffer/dismissOfferCommand.js';
import { DismissOfferCommandHandler } from '../../src/application/features/notifications/commands/dismissOffer/dismissOfferCommandHandler.js';
import { BookingExpiryJob } from '../../src/application/features/bookingLifecycle/jobs/bookingExpiryJob.js';
import { CLIENT_OUTCOME_EVENT_TYPES, ClientOutcomeNoticeHandler } from '../../src/application/features/bookingLifecycle/handlers/clientOutcomeNoticeHandler.js';
import { FakeBookingLifecycleStore } from '../fakes/fakeBookingLifecycleStore.js';
import { CancelAllJob } from '../../src/application/features/bookingLifecycle/jobs/cancelAllJob.js';
import { GOALKEEPER_CANCELLATION_EVENT_TYPES, GoalkeeperCancellationNoticeHandler } from '../../src/application/features/bookingLifecycle/handlers/goalkeeperCancellationNoticeHandler.js';
import { CancelBookingsByClientCommand } from '../../src/application/features/bookingLifecycle/commands/cancelBookingsByClient/cancelBookingsByClientCommand.js';
import { ListGoalkeeperWithdrawalsQuery } from '../../src/application/features/bookingLifecycle/queries/listGoalkeeperWithdrawals/listGoalkeeperWithdrawalsQuery.js';
import { ListGoalkeeperWithdrawalsQueryHandler } from '../../src/application/features/bookingLifecycle/queries/listGoalkeeperWithdrawals/listGoalkeeperWithdrawalsQueryHandler.js';
import { ReverseWithdrawalPenaltyCommand } from '../../src/application/features/bookingLifecycle/commands/reverseWithdrawalPenalty/reverseWithdrawalPenaltyCommand.js';
import { ReverseWithdrawalPenaltyCommandHandler } from '../../src/application/features/bookingLifecycle/commands/reverseWithdrawalPenalty/reverseWithdrawalPenaltyCommandHandler.js';
import { CheckInToBookingCommand } from '../../src/application/features/bookingLifecycle/commands/checkInToBooking/checkInToBookingCommand.js';
import { CheckInToBookingCommandHandler } from '../../src/application/features/bookingLifecycle/commands/checkInToBooking/checkInToBookingCommandHandler.js';
import { createCheckInWindowResolver } from '../../src/application/features/bookingLifecycle/common/checkInWindowResolver.js';
import { WithdrawFromBookingCommand } from '../../src/application/features/bookingLifecycle/commands/withdrawFromBooking/withdrawFromBookingCommand.js';
import { WithdrawFromBookingCommandHandler } from '../../src/application/features/bookingLifecycle/commands/withdrawFromBooking/withdrawFromBookingCommandHandler.js';
import { CHECK_IN_NOTICE_EVENT_TYPES, CheckInNoticeHandler } from '../../src/application/features/bookingLifecycle/handlers/checkInNoticeHandler.js';
import { RateBookingCommand } from '../../src/application/features/ratings/commands/rateBooking/rateBookingCommand.js';
import { RateBookingCommandHandler } from '../../src/application/features/ratings/commands/rateBooking/rateBookingCommandHandler.js';
import { ListPendingRatingsQuery } from '../../src/application/features/ratings/queries/listPendingRatings/listPendingRatingsQuery.js';
import { ListPendingRatingsQueryHandler } from '../../src/application/features/ratings/queries/listPendingRatings/listPendingRatingsQueryHandler.js';
import { ListCasesQuery } from '../../src/application/features/cases/queries/listCases/listCasesQuery.js';
import { ListCasesQueryHandler } from '../../src/application/features/cases/queries/listCases/listCasesQueryHandler.js';
import { GetCaseQuery } from '../../src/application/features/cases/queries/getCase/getCaseQuery.js';
import { GetCaseQueryHandler } from '../../src/application/features/cases/queries/getCase/getCaseQueryHandler.js';
import { ResolveCaseCommand } from '../../src/application/features/cases/commands/resolveCase/resolveCaseCommand.js';
import { ResolveCaseCommandHandler } from '../../src/application/features/cases/commands/resolveCase/resolveCaseCommandHandler.js';
import { NoShowWatchJob } from '../../src/application/features/bookingLifecycle/jobs/noShowWatchJob.js';
import { NO_SHOW_NOTICE_EVENT_TYPES, NoShowNoticeHandler } from '../../src/application/features/bookingLifecycle/handlers/noShowNoticeHandler.js';
import { createNoShowGraceResolver } from '../../src/application/features/bookingLifecycle/common/checkInWindowResolver.js';
import { FakeRatingRepository } from '../fakes/fakeRatingRepository.js';
import { FakeCaseRepository } from '../fakes/fakeCaseRepository.js';
import { BookingCompletionJob } from '../../src/application/features/bookingLifecycle/jobs/bookingCompletionJob.js';
import { CheckInWatchJob } from '../../src/application/features/bookingLifecycle/jobs/checkInWatchJob.js';
import { ContactsRevealJob } from '../../src/application/features/bookingLifecycle/jobs/contactsRevealJob.js';
import { CLIENT_ASSIGNMENT_EVENT_TYPES, ClientAssignmentNoticeHandler } from '../../src/application/features/bookingLifecycle/handlers/clientAssignmentNoticeHandler.js';
import { WITHDRAWAL_NOTICE_EVENT_TYPES, WithdrawalNoticeHandler } from '../../src/application/features/bookingLifecycle/handlers/withdrawalNoticeHandler.js';
import { FakeGoalkeeperIncidentRepository } from '../fakes/fakeGoalkeeperIncidentRepository.js';
import { CancelBookingsByClientCommandHandler } from '../../src/application/features/bookingLifecycle/commands/cancelBookingsByClient/cancelBookingsByClientCommandHandler.js';
import { NotifyBookingOffersHandler, OFFER_EVENT_TYPES } from '../../src/application/features/notifications/handlers/notifyBookingOffersHandler.js';
import { FakeNotificationRepository } from '../fakes/fakeNotificationRepository.js';
import { FakeOfferPushState } from '../fakes/fakeOfferPushState.js';

export interface TestAppContext {
  /** The app, already listening on 127.0.0.1 (see `listenOnLoopback`); pass it to supertest's `request`. */
  app: Server;
  userRepository: FakeUserRepository;
  refreshTokenRepository: FakeRefreshTokenRepository;
  googleValidator: FakeGoogleIdTokenValidator;
  tokenIssuer: FakeInternalTokenIssuer;
  countryRepository: FakeCountryRepository;
  termsAcceptanceRepository: FakeTermsAcceptanceRepository;
  imageStorageProvider: FakeImageStorageProvider;
  imageRepository: FakeImageRepository;
  goalkeeperRegistrationRepository: FakeGoalkeeperRegistrationRepository;
  documentTypeRepository: FakeDocumentTypeRepository;
  goalkeeperProfileRepository: FakeGoalkeeperProfileRepository;
  cityRepository: FakeCityRepository;
  regionRepository: FakeRegionRepository;
  zoneRepository: FakeZoneRepository;
  rentalRateRepository: FakeRentalRateRepository;
  bookingSettingsRepository: FakeBookingSettingsRepository;
  /** The countries (with their currency) the quote endpoint reads — separate from `countryRepository`, which the profile/locations suites assert on. */
  quoteCountryRepository: FakeCountryRepository;
  /** Quotes stored by `POST /quote` (and confirmed by `POST /bookings`). */
  quoteRepository: FakeQuoteRepository;
  /** Requests created by `POST /bookings` (one per match). */
  requestRepository: FakeGoalkeeperRequestRepository;
  /** Bookings created by `POST /bookings` (one per goalkeeper). */
  bookingRepository: FakeBookingRepository;
  /** The confirmation store over the quote, request and booking fakes; `failNextWith` simulates concurrency. */
  quoteConfirmationStore: FakeQuoteConfirmationStore;
  bookingAuditLogger: FakeBookingAuditLogger;
  lifecycleStore: FakeBookingLifecycleStore;
  goalkeeperIncidentRepository: FakeGoalkeeperIncidentRepository;
  /** Set the reference "now" for the quote endpoint (defaults to `QUOTE_NOW`, 13:00 in Bogotá). */
  clock: FixedClock;
  /** Mutate `.status` before a request to simulate an unhealthy dependency. */
  health: HealthReportResponse;
  /** The wallet ledger state (movements and wallets) behind `/me/wallet` and `/api/admin/…/wallet`. */
  walletStore: FakeWalletStore;
  /** Seeded by `seedQuoteWorld`: every quote-world country has a country-level commission (Colombia 7.000 COP). */
  commissionSettingRepository: FakeCommissionSettingRepository;
  /** The real ledger over the fake store: tests seed movements through it. */
  walletLedger: WalletLedger;
  /** Events recorded by confirmations and acceptances (feature 013). */
  outboxStore: FakeOutboxStore;
  /** What the relay and the sweep handed to the messaging service; `failNextWith` simulates an outage. */
  eventPublisher: FakeEventPublisher;
  /** What the example consumer recorded (feature 013). */
  eventDeliveryLog: FakeEventDeliveryLog;
  /** The composition root's mediator, to send commands (e.g. the sweep) directly. */
  mediator: Mediator;
  /** Push devices registered through `/api/devices` (feature 014). */
  deviceRepository: FakeDeviceRepository;
  /** What reached the push service; `setOutcome(token, 'invalid')` simulates a dead token. */
  pushSender: FakePushSender;
  /** Every user's inbox, offers included (feature 015). */
  notificationRepository: FakeNotificationRepository;
  offerPushState: FakeOfferPushState;
  /** Each country's VAT rate (feature 023); empty = 0 % everywhere. */
  taxSettingsRepository: FakeTaxSettingsRepository;
  /** Invoicing (feature 023): the fake provider (scripted answers), credentials, settings (empty) and documents. */
  invoicingProvider: FakeInvoicingProvider;
  invoicingSecrets: FakeInvoicingSecrets;
  invoicingSettingsRepository: FakeInvoicingSettingsRepository;
  invoicingDocumentRepository: FakeInvoicingDocumentRepository;
  /** Wallet top-ups (feature 022): the gateway signs like Wompi; its transactions query answers from a queue. */
  paymentGateway: FakePaymentGateway;
  paymentSecrets: FakePaymentSecrets;
  /** Empty by default: `seed()` configures Colombia's Wompi settings. */
  paymentGatewaySettingsRepository: FakePaymentGatewaySettingsRepository;
  topUpRepository: FakeTopUpRepository;
}

/** The API's public base in HTTP tests: the gateway's return address starts with it. */
export const TEST_PAYMENTS_BASE_URL = 'https://api.test.porterospro.co';

/**
 * Fake-backed composition root for HTTP-level tests — the Node equivalent of the
 * source's `WebApplicationFactory` + `ConfigureTestServices`/`RemoveAll<T>()`. Grows
 * incrementally as each user story adds its own handlers/registrations.
 */
export interface BuildTestAppOptions {
  /**
   * `local` wires the relay to the in-process publisher (events reach the consumers during the
   * request, as in local development); by default the relay hands events to `eventPublisher`.
   */
  eventsMode?: 'fake' | 'local';
  /** The return page's button and app link association; unset by default (the files answer 404). */
  paymentReturn?: Partial<PaymentReturnSettings>;
}

/** The only token `/internal/*` accepts in HTTP tests (stands in for a platform OIDC token). */
export const TEST_INTERNAL_TOKEN = 'test-internal-token';

export async function buildTestApp(options: BuildTestAppOptions = {}): Promise<TestAppContext> {
  const mediator = new Mediator();
  const userRepository = new FakeUserRepository();
  const refreshTokenRepository = new FakeRefreshTokenRepository();
  const googleValidator = new FakeGoogleIdTokenValidator();
  const tokenIssuer = new FakeInternalTokenIssuer();
  const countryRepository = new FakeCountryRepository();
  countryRepository.seed(new Country({ id: 'c1', name: 'Colombia', dialCode: '+57', countryCode: 'CO' }));
  const termsAcceptanceRepository = new FakeTermsAcceptanceRepository();
  const imageStorageProvider = new FakeImageStorageProvider();
  const imageRepository = new FakeImageRepository();
  const goalkeeperRegistrationRepository = new FakeGoalkeeperRegistrationRepository();
  const documentTypeRepository = new FakeDocumentTypeRepository();
  documentTypeRepository.seed(new DocumentType({ id: 'dt1', code: 'cedula_ciudadania', name: 'Cédula de ciudadanía' }));
  documentTypeRepository.seed(new DocumentType({ id: 'dt2', code: 'cedula_extranjeria', name: 'Cédula de extranjería' }));
  documentTypeRepository.seed(new DocumentType({ id: 'dt3', code: 'pasaporte', name: 'Pasaporte' }));
  const goalkeeperProfileRepository = new FakeGoalkeeperProfileRepository();

  const regionRepository = new FakeRegionRepository();
  regionRepository.seed(new Region({ id: 'region-antioquia', name: 'Antioquia' }));
  regionRepository.seed(new Region({ id: 'region-cundinamarca', name: 'Cundinamarca' }));
  const cityRepository = new FakeCityRepository();
  cityRepository.seed(new City({ id: 'city-medellin', name: 'Medellín', regionId: 'region-antioquia', zoneCityId: null }));
  cityRepository.seed(new City({ id: 'city-envigado', name: 'Envigado', regionId: 'region-antioquia', zoneCityId: 'city-medellin' }));
  cityRepository.seed(new City({ id: 'city-bogota', name: 'Bogotá', regionId: 'region-cundinamarca', zoneCityId: null }));
  const zoneRepository = new FakeZoneRepository();
  const zonePolygon = { type: 'Polygon' as const, coordinates: [[[0, 0]]] };
  zoneRepository.seed(
    new Zone({ id: 'zone-bello', cityId: 'city-medellin', name: 'Bello', slug: 'medellin-co-bello', geometry: zonePolygon, active: true, displayOrder: 1 }),
  );
  zoneRepository.seed(
    new Zone({
      id: 'zone-copacabana',
      cityId: 'city-medellin',
      name: 'Copacabana',
      slug: 'medellin-co-copacabana',
      geometry: zonePolygon,
      active: true,
      displayOrder: 2,
    }),
  );

  const quoteCountryRepository = new FakeCountryRepository();
  const rentalRateRepository = new FakeRentalRateRepository();
  const bookingSettingsRepository = new FakeBookingSettingsRepository();
  const clock = new FixedClock(QUOTE_NOW);
  const walletStore = new FakeWalletStore(() => clock.now());
  const commissionSettingRepository = new FakeCommissionSettingRepository();
  const walletLedger = new WalletLedger(walletStore, walletStore, { newId: () => uuidv7() }, clock);
  const walletContext = { goalkeeperProfileRepository, cityRepository, regionRepository, countryLookup: quoteCountryRepository };
  // VAT on top of commissions (feature 023): 0 % until a test seeds a rate.
  const taxSettingsRepository = new FakeTaxSettingsRepository();
  const vatRates = createVatRateResolver(taxSettingsRepository, { cityRepository, regionRepository }, { warn: () => undefined });
  const commissionResolver = new CommissionResolver(commissionSettingRepository, zoneRepository, cityRepository, regionRepository);
  const paymentGateway = new FakePaymentGateway();
  const paymentGatewayRegistry = new FakePaymentGatewayRegistry([paymentGateway]);
  const paymentSecrets = new FakePaymentSecrets();
  const paymentGatewaySettingsRepository = new FakePaymentGatewaySettingsRepository();
  const topUpRepository = new FakeTopUpRepository();
  const topUpStore = new FakeTopUpStore(topUpRepository, walletStore);
  const quoteRepository = new FakeQuoteRepository();
  const requestRepository = new FakeGoalkeeperRequestRepository();
  const bookingRepository = new FakeBookingRepository();
  const outboxStore = new FakeOutboxStore();
  const eventPublisher = new FakeEventPublisher();
  const eventLogger = { info: () => undefined, warn: () => undefined };
  const relayPublisher = options.eventsMode === 'local' ? new InProcessEventPublisher(mediator) : eventPublisher;
  const eventRelay = new EventRelay(relayPublisher, outboxStore, clock, eventLogger, 2000);
  const eventDeliveryLog = new FakeEventDeliveryLog();
  const deliveryLogHandler = new LogEventDeliveryHandler(eventDeliveryLog, new FakeProcessedEventStore(), clock, eventLogger);
  registerSubscribers(
    mediator,
    DELIVERY_LOG_EVENT_TYPES.map((type) => ({ type, handler: deliveryLogHandler })),
  );
  // Invoicing (feature 023), with a fake provider that answers like Siigo.
  const invoicingProvider = new FakeInvoicingProvider();
  const invoicingSecrets = new FakeInvoicingSecrets();
  const invoicingSettingsRepository = new FakeInvoicingSettingsRepository();
  const invoicingDocumentRepository = new FakeInvoicingDocumentRepository();
  const invoicingDeps = {
    documents: invoicingDocumentRepository,
    settings: invoicingSettingsRepository,
    providers: new FakeInvoicingProviderRegistry([invoicingProvider]),
    secrets: invoicingSecrets,
    countryLookup: quoteCountryRepository,
    cityRepository,
    logger: { info: () => undefined, warn: () => undefined },
    enabled: true,
    movements: walletStore,
    users: userRepository,
    walletContext,
    idGenerator: { newId: () => uuidv7() },
    clock,
  };
  const invoicingHandler = new CreateInvoicingDocumentHandler(invoicingDeps);
  registerSubscribers(
    mediator,
    BILLING_EVENT_TYPES.map((type) => ({ type, handler: invoicingHandler })),
  );
  const quoteConfirmationStore = new FakeQuoteConfirmationStore(quoteRepository, requestRepository, bookingRepository, outboxStore);
  const bookingAuditLogger = new FakeBookingAuditLogger();
  const deviceRepository = new FakeDeviceRepository();
  const pushSender = new FakePushSender();
  const deviceLogger = { info: () => undefined, warn: () => undefined, error: () => undefined };
  const pushNotifier = new PushNotifier({ devices: deviceRepository, sender: pushSender, logger: deviceLogger, fingerprint: sha256TokenFingerprint });
  const notificationRepository = new FakeNotificationRepository();
  const offerPushState = new FakeOfferPushState();
  const offersLogger = { info: () => undefined, warn: () => undefined };
  const offerEligibility = new OfferEligibilityService({
    goalkeeperProfileRepository,
    walletRepository: walletStore,
    commissionResolver,
    bookingRepository,
    vatRates,
  });
  const offerSender = new OfferSender({
    notifications: notificationRepository,
    pushState: offerPushState,
    pushNotifier,
    idGenerator: { newId: () => uuidv7() },
    requestRepository,
    zoneRepository,
    cityRepository,
    logger: offersLogger,
    maxReminders: 3,
    intervalMinutes: 5,
  });
  const lifecycleStore = new FakeBookingLifecycleStore(bookingRepository, requestRepository, walletStore, outboxStore, goalkeeperProfileRepository);
  const goalkeeperIncidentRepository = new FakeGoalkeeperIncidentRepository(lifecycleStore);
  const ratingRepository = new FakeRatingRepository(() => lifecycleStore.ratings());
  const caseRepository = new FakeCaseRepository(lifecycleStore.cases);
  const lifecycleIds = { newId: () => uuidv7() };
  const bookingExpiryJob = new BookingExpiryJob({ bookingRepository, store: lifecycleStore, relay: eventRelay, idGenerator: lifecycleIds, logger: offersLogger });
  const clientOutcomeNotices = new ClientOutcomeNoticeHandler({
    requestRepository,
    bookingRepository,
    zoneRepository,
    cityRepository,
    notifications: notificationRepository,
    pushNotifier,
    processed: new FakeProcessedEventStore(),
    idGenerator: lifecycleIds,
    clock,
    logger: offersLogger,
  });
  const cancelAllJob = new CancelAllJob({
    requestRepository,
    bookingRepository,
    store: lifecycleStore,
    walletContext,
    relay: eventRelay,
    idGenerator: lifecycleIds,
    logger: offersLogger,
  });
  const goalkeeperCancellationNotices = new GoalkeeperCancellationNoticeHandler({
    requestRepository,
    zoneRepository,
    cityRepository,
    notifications: notificationRepository,
    pushNotifier,
    processed: new FakeProcessedEventStore(),
    idGenerator: lifecycleIds,
    clock,
    logger: offersLogger,
  });
  registerSubscribers(
    mediator,
    GOALKEEPER_CANCELLATION_EVENT_TYPES.map((type) => ({ type, handler: goalkeeperCancellationNotices })),
  );
  registerSubscribers(mediator, [
    ...CLIENT_OUTCOME_EVENT_TYPES.map((type) => ({ type, handler: clientOutcomeNotices })),
    ...NO_SHOW_NOTICE_EVENT_TYPES.map((type) => ({
      type,
      handler: new NoShowNoticeHandler({
        requestRepository,
        zoneRepository,
        cityRepository,
        notifications: notificationRepository,
        pushNotifier,
        processed: new FakeProcessedEventStore(),
        idGenerator: lifecycleIds,
        clock,
        logger: offersLogger,
      }),
    })),
    ...CHECK_IN_NOTICE_EVENT_TYPES.map((type) => ({
      type,
      handler: new CheckInNoticeHandler({
        requestRepository,
        zoneRepository,
        cityRepository,
        notifications: notificationRepository,
        pushNotifier,
        processed: new FakeProcessedEventStore(),
        idGenerator: lifecycleIds,
        clock,
        logger: offersLogger,
      }),
    })),
    ...CLIENT_ASSIGNMENT_EVENT_TYPES.map((type) => ({
      type,
      handler: new ClientAssignmentNoticeHandler({
        requestRepository,
        bookingRepository,
        userRepository,
        zoneRepository,
        cityRepository,
        notifications: notificationRepository,
        pushNotifier,
        processed: new FakeProcessedEventStore(),
        idGenerator: lifecycleIds,
        clock,
        logger: offersLogger,
      }),
    })),
    ...WITHDRAWAL_NOTICE_EVENT_TYPES.map((type) => ({
      type,
      handler: new WithdrawalNoticeHandler({
        requestRepository,
        zoneRepository,
        cityRepository,
        notifications: notificationRepository,
        pushNotifier,
        processed: new FakeProcessedEventStore(),
        idGenerator: lifecycleIds,
        clock,
        logger: offersLogger,
      }),
    })),
    ...OFFER_EVENT_TYPES.map((type) => ({ type, handler: new NotifyBookingOffersHandler(mediator, new FakeProcessedEventStore(), clock) })),
  ]);
  seedQuoteWorld({ countryRepository: quoteCountryRepository, zoneRepository, cityRepository, regionRepository, rentalRateRepository, bookingSettingsRepository, commissionSettingRepository });

  const ssoCatalog: ISsoProviderCatalog = {
    getProviders: (platform) =>
      platform === 'mobile'
        ? [{ provider: 'google', clientId: 'mobile-client-id', scopes: ['openid', 'email', 'profile'] }]
        : platform === 'admin-web'
          ? [{ provider: 'google', clientId: 'web-client-id', scopes: ['openid', 'email', 'profile'] }]
          : [],
  };

  let idCounter = 0;
  const idGenerator = { newId: (): string => `test-id-${++idCounter}` };
  const auditLogger = { logSsoAttempt: (): void => undefined };
  // Quote and booking ids must be real UUIDs: the confirmation answers 404 to anything else.
  const uuidGenerator = { newId: (): string => uuidv7() };

  registerHandlers(mediator, [
    {
      requestType: RunSweepCommand,
      handler: new RunSweepCommandHandler({
        outbox: outboxStore,
        // As in production: in local mode the sweep delivers pending events to the in-process consumers.
        publisher: relayPublisher,
        clock,
        logger: eventLogger,
        batchLimit: 200,
        pendingWarningMinutes: 5,
        jobs: [
          cancelAllJob,
          bookingExpiryJob,
          new BookingCompletionJob({ bookingRepository, store: lifecycleStore, relay: eventRelay, idGenerator: lifecycleIds, logger: offersLogger }),
          new NoShowWatchJob({
            walletContext,
            bookingSettingsRepository,
            logger: offersLogger,
            bookingRepository,
            requestRepository,
            store: lifecycleStore,
            relay: eventRelay,
            idGenerator: lifecycleIds,
            clock,
            graceResolver: () => createNoShowGraceResolver({ cityRepository, regionRepository, bookingSettingsRepository, logger: offersLogger }),
          }),
          new OfferRemindersJob({ bookingRepository, eligibility: offerEligibility, sender: offerSender, logger: offersLogger, roundCap: 2000 }),
          new ContactsRevealJob({
            requestRepository,
            bookingRepository,
            userRepository,
            zoneRepository,
            cityRepository,
            notifications: notificationRepository,
            pushNotifier,
            idGenerator: lifecycleIds,
            clock,
            logger: offersLogger,
          }),
          new CheckInWatchJob({
            bookingRepository,
            requestRepository,
            userRepository,
            zoneRepository,
            cityRepository,
            notifications: notificationRepository,
            pushNotifier,
            idGenerator: lifecycleIds,
            clock,
            logger: offersLogger,
            windowResolver: () => createCheckInWindowResolver({ cityRepository, regionRepository, bookingSettingsRepository, logger: offersLogger }),
          }),
          new TopUpReconcileJob({
            walletContext,
            store: topUpStore,
            notices: { notifications: notificationRepository, pushNotifier, idGenerator: lifecycleIds, clock },
            logger: offersLogger,
            topUpRepository,
            gateways: paymentGatewayRegistry,
            secrets: paymentSecrets,
            countryLookup: quoteCountryRepository,
          }),
          new InvoicingIssuerJob({ ...invoicingDeps, scanner: new FakeBillableMovementScanner(walletStore, invoicingDocumentRepository), cap: 100 }),
        ],
        jobLocks: new FakeJobLockStore(),
      }),
    },
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
        { termsVersion: '1.0', privacyPolicyVersion: '1.0' },
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
        quoteCountryRepository,
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
        quoteCountryRepository,
        rentalRateRepository,
        bookingSettingsRepository,
        commissionResolver,
        clock,
      ),
    },
    {
      requestType: IssueServiceQuoteCommand,
      handler: new IssueServiceQuoteCommandHandler(mediator, quoteRepository, uuidGenerator, clock),
    },
    {
      requestType: ConfirmBookingCommand,
      handler: new ConfirmBookingCommandHandler(
        requestRepository,
        bookingRepository,
        userRepository,
        quoteRepository,
        quoteConfirmationStore,
        uuidGenerator,
        clock,
        bookingAuditLogger,
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
      handler: new GetGoalkeeperWalletQueryHandler(walletContext, walletStore, commissionResolver, clock, vatRates),
    },
    {
      requestType: GetTopUpOptionsQuery,
      handler: new GetTopUpOptionsQueryHandler(walletContext, paymentGatewaySettingsRepository, termsAcceptanceRepository, { termsVersion: '1.0' }),
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
        idGenerator: { newId: () => uuidv7() },
        clock,
        logger: offersLogger,
        settings: { termsVersion: '1.0', publicBaseUrl: TEST_PAYMENTS_BASE_URL },
      }),
    },
    {
      requestType: ApplyGatewayEventCommand,
      handler: new ApplyGatewayEventCommandHandler({
        walletContext,
        store: topUpStore,
        notices: { notifications: notificationRepository, pushNotifier, idGenerator: lifecycleIds, clock },
        logger: offersLogger,
        gateways: paymentGatewayRegistry,
        secrets: paymentSecrets,
        topUpRepository,
        countryLookup: quoteCountryRepository,
        clock,
      }),
    },
    { requestType: ListTopUpsQuery, handler: new ListTopUpsQueryHandler(goalkeeperProfileRepository, topUpRepository) },
    { requestType: GetTopUpQuery, handler: new GetTopUpQueryHandler(topUpRepository) },
    { requestType: GetTopUpByReferenceQuery, handler: new GetTopUpByReferenceQueryHandler(topUpRepository) },
    {
      requestType: SetGatewaySettingsCommand,
      handler: new SetGatewaySettingsCommandHandler(quoteCountryRepository, paymentGatewaySettingsRepository, clock, offersLogger),
    },
    { requestType: GetGatewaySettingsQuery, handler: new GetGatewaySettingsQueryHandler(paymentGatewaySettingsRepository) },
    { requestType: ListMyDocumentsQuery, handler: new ListMyDocumentsQueryHandler(goalkeeperProfileRepository, invoicingDocumentRepository) },
    { requestType: GetMyDocumentQuery, handler: new GetMyDocumentQueryHandler(invoicingDocumentRepository) },
    { requestType: GetDocumentFileQuery, handler: new GetDocumentFileQueryHandler(invoicingDeps) },
    {
      requestType: SetTaxSettingsCommand,
      handler: new SetTaxSettingsCommandHandler(quoteCountryRepository, taxSettingsRepository, clock, invoicingDeps.logger),
    },
    { requestType: GetTaxSettingsQuery, handler: new GetTaxSettingsQueryHandler(taxSettingsRepository) },
    {
      requestType: SetInvoicingSettingsCommand,
      handler: new SetInvoicingSettingsCommandHandler(quoteCountryRepository, invoicingSettingsRepository, invoicingDeps.secrets, clock, invoicingDeps.logger),
    },
    { requestType: GetInvoicingSettingsQuery, handler: new GetInvoicingSettingsQueryHandler(invoicingSettingsRepository, invoicingDeps.secrets, quoteCountryRepository) },
    { requestType: ListDocumentsForAdminQuery, handler: new ListDocumentsForAdminQueryHandler(invoicingDocumentRepository, clock) },
    {
      requestType: RetryDocumentCommand,
      handler: new RetryDocumentCommandHandler({ ...invoicingDeps, profiles: goalkeeperProfileRepository }),
    },
    {
      requestType: AcceptCurrentTermsCommand,
      handler: new AcceptCurrentTermsCommandHandler(termsAcceptanceRepository, { newId: () => uuidv7() }, clock, {
        termsVersion: '1.0',
        privacyPolicyVersion: '1.0',
      }),
    },
    {
      requestType: RecordWalletAdjustmentCommand,
      handler: new RecordWalletAdjustmentCommandHandler(walletContext, walletLedger, walletStore),
    },
    {
      requestType: AcceptBookingCommand,
      handler: new AcceptBookingCommandHandler({
        walletContext,
        walletRepository: walletStore,
        bookingRepository,
        requestRepository,
        zoneRepository,
        cityRepository,
        userRepository,
        store: new FakeBookingAcceptanceStore(bookingRepository, walletStore, outboxStore),
        idGenerator: uuidGenerator,
        clock,
        audit: new FakeAcceptanceAuditLogger(),
        relay: eventRelay,
        vatRates,
      }),
    },
    {
      requestType: ListAvailableBookingsQuery,
      handler: new ListAvailableBookingsQueryHandler({
        vatRates,
        goalkeeperProfileRepository,
        walletRepository: walletStore,
        commissionResolver,
        bookingRepository,
        requestRepository: requestRepository,
        zoneRepository,
        cityRepository,
        clock,
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
      handler: new ListWalletMovementsQueryHandler(goalkeeperProfileRepository, walletStore, walletStore),
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
      requestType: CancelGoalkeeperRegistrationCommand,
      handler: new CancelGoalkeeperRegistrationCommandHandler(mediator, goalkeeperRegistrationRepository),
    },
    {
      requestType: SetOffersAvailabilityCommand,
      handler: new SetOffersAvailabilityCommandHandler({ goalkeeperProfileRepository, eligibility: offerEligibility, sender: offerSender, clock, logger: offersLogger }),
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
        idGenerator: lifecycleIds,
        clock,
        audit: bookingAuditLogger,
        logger: offersLogger,
      }),
    },
    {
      requestType: ListGoalkeeperWithdrawalsQuery,
      handler: new ListGoalkeeperWithdrawalsQueryHandler({ goalkeeperProfileRepository, incidents: goalkeeperIncidentRepository, clock }),
    },
    {
      requestType: ReverseWithdrawalPenaltyCommand,
      handler: new ReverseWithdrawalPenaltyCommandHandler({ walletContext, store: lifecycleStore, idGenerator: lifecycleIds, clock, audit: bookingAuditLogger, logger: offersLogger }),
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
        windowResolver: () => createCheckInWindowResolver({ cityRepository, regionRepository, bookingSettingsRepository, logger: offersLogger }),
        store: lifecycleStore,
        relay: eventRelay,
        idGenerator: lifecycleIds,
        clock,
        audit: bookingAuditLogger,
      }),
    },
    {
      requestType: RateBookingCommand,
      handler: new RateBookingCommandHandler({
        walletContext,
        bookingSettingsRepository,
        logger: offersLogger,
        bookingRepository,
        store: lifecycleStore,
        relay: eventRelay,
        idGenerator: lifecycleIds,
        clock,
        audit: bookingAuditLogger,
      }),
    },
    {
      requestType: ListPendingRatingsQuery,
      handler: new ListPendingRatingsQueryHandler({ bookingRepository, ratingRepository: ratingRepository, requestRepository, zoneRepository, cityRepository, userRepository, clock }),
    },
    { requestType: ListCasesQuery, handler: new ListCasesQueryHandler(caseRepository) },
    { requestType: GetCaseQuery, handler: new GetCaseQueryHandler(caseRepository, ratingRepository) },
    { requestType: ResolveCaseCommand, handler: new ResolveCaseCommandHandler(caseRepository, ratingRepository, clock, bookingAuditLogger) },
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
        idGenerator: lifecycleIds,
        clock,
        audit: bookingAuditLogger,
        logger: offersLogger,
      }),
    },
    {
      requestType: NotifyBookingOffersCommand,
      handler: new NotifyBookingOffersCommandHandler({ bookingRepository, eligibility: offerEligibility, sender: offerSender, clock, logger: offersLogger }),
    },
    {
      requestType: RegisterDeviceCommand,
      handler: new RegisterDeviceCommandHandler({
        devices: deviceRepository,
        clock,
        logger: deviceLogger,
        fingerprint: sha256TokenFingerprint,
        maxDevicesPerUser: 10,
      }),
    },
    {
      requestType: UnregisterDeviceCommand,
      handler: new UnregisterDeviceCommandHandler({ devices: deviceRepository, logger: deviceLogger, fingerprint: sha256TokenFingerprint }),
    },
    {
      requestType: SendTestPushCommand,
      handler: new SendTestPushCommandHandler({ notifier: pushNotifier, limiter: new InMemoryRateLimiter(), clock, limitPerMinute: 5 }),
    },
  ]);

  const health: HealthReportResponse = { status: 'Healthy', checks: [{ name: 'mongodb', status: 'Healthy' }] };

  const dependencies: AppDependencies = {
    mediator,
    verifyAccessToken: (token) => tokenIssuer.verifyAccessToken(token),
    checkHealth: async () => health,
    publisher: mediator,
    verifyInternalCaller: async (token) => token === TEST_INTERNAL_TOKEN,
    paymentReturn: { appOpenUrl: '', androidPackage: '', androidCertSha256: [], iosAppId: '', ...options.paymentReturn },
  };

  return {
    app: await listenOnLoopback(createApp(dependencies)),
    userRepository,
    refreshTokenRepository,
    googleValidator,
    tokenIssuer,
    countryRepository,
    termsAcceptanceRepository,
    imageStorageProvider,
    imageRepository,
    goalkeeperRegistrationRepository,
    documentTypeRepository,
    goalkeeperProfileRepository,
    cityRepository,
    regionRepository,
    zoneRepository,
    rentalRateRepository,
    bookingSettingsRepository,
    quoteCountryRepository,
    quoteRepository,
    requestRepository,
    bookingRepository,
    quoteConfirmationStore,
    bookingAuditLogger,
    lifecycleStore,
    goalkeeperIncidentRepository,
    clock,
    health,
    walletStore,
    commissionSettingRepository,
    walletLedger,
    outboxStore,
    eventPublisher,
    eventDeliveryLog,
    mediator,
    deviceRepository,
    pushSender,
    notificationRepository,
    offerPushState,
    taxSettingsRepository,
    invoicingProvider,
    invoicingSecrets,
    invoicingSettingsRepository,
    invoicingDocumentRepository,
    paymentGateway,
    paymentSecrets,
    paymentGatewaySettingsRepository,
    topUpRepository,
  };
}
