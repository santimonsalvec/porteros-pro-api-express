import { ListGatewaySettingsQuery } from '../application/features/payments/queries/listGatewaySettings/listGatewaySettingsQuery.js';
import { ListGatewaySettingsQueryHandler } from '../application/features/payments/queries/listGatewaySettings/listGatewaySettingsQueryHandler.js';
import { DeleteMarketGatewayOverrideCommand } from '../application/features/payments/commands/deleteMarketGatewayOverride/deleteMarketGatewayOverrideCommand.js';
import { DeleteMarketGatewayOverrideCommandHandler } from '../application/features/payments/commands/deleteMarketGatewayOverride/deleteMarketGatewayOverrideCommandHandler.js';
import { Mediator, registerHandlers, registerSubscribers } from '../application/common/mediator/mediator.js';
import { WithdrawalAdminDetails } from '../application/features/bookingLifecycle/common/withdrawalAdminDetails.js';
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
import { GetZonesByMarketQuery } from '../application/features/zones/queries/getZonesByMarket/getZonesByMarketQuery.js';
import { GetZonesByMarketQueryHandler } from '../application/features/zones/queries/getZonesByMarket/getZonesByMarketQueryHandler.js';
import { ListEnabledMarketsQuery } from '../application/features/markets/queries/listEnabledMarkets/listEnabledMarketsQuery.js';
import { ListEnabledMarketsQueryHandler } from '../application/features/markets/queries/listEnabledMarkets/listEnabledMarketsQueryHandler.js';
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
import { SaveBillingSectionCommand } from '../application/features/goalkeepers/commands/saveBillingSection/saveBillingSectionCommand.js';
import { ChangeGoalkeeperMarketCommand } from '../application/features/goalkeepers/commands/changeGoalkeeperMarket/changeGoalkeeperMarketCommand.js';
import { ChangeGoalkeeperMarketCommandHandler } from '../application/features/goalkeepers/commands/changeGoalkeeperMarket/changeGoalkeeperMarketCommandHandler.js';
import { MongoGoalkeeperMarketChangeStore } from './persistence/mongo/goalkeeperMarketChangeStore.js';
import { SaveBillingSectionCommandHandler } from '../application/features/goalkeepers/commands/saveBillingSection/saveBillingSectionCommandHandler.js';
import { UpdateGoalkeeperBillingCommand } from '../application/features/goalkeepers/commands/updateGoalkeeperBilling/updateGoalkeeperBillingCommand.js';
import { UpdateGoalkeeperBillingCommandHandler } from '../application/features/goalkeepers/commands/updateGoalkeeperBilling/updateGoalkeeperBillingCommandHandler.js';
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
import { assertEmailConfig, assertEventsConfig, assertOffersConfig, assertPushConfig, config } from './config.js';
import { MongoConnectionProvider } from './persistence/mongo/mongoConnectionProvider.js';
import { UserRepository } from './persistence/mongo/userRepository.js';
import { RefreshTokenRepository } from './persistence/mongo/refreshTokenRepository.js';
import { TermsAcceptanceRepository } from './persistence/mongo/termsAcceptanceRepository.js';
import { CountryRepository, MongoAdminCountryRepository } from './persistence/mongo/countryRepository.js';
import { MongoReferenceUsage } from './persistence/mongo/referenceUsage.js';
import { CommissionResolver } from '../application/features/operatingBalance/common/commissionResolver.js';
import { OperatingBalanceLedger } from '../application/features/operatingBalance/common/operatingBalanceLedger.js';
import { ListAvailableBookingsQuery } from '../application/features/goalkeeperRequests/queries/listAvailableBookings/listAvailableBookingsQuery.js';
import { ListGoalkeeperAgendaQuery } from '../application/features/goalkeeperRequests/queries/listGoalkeeperAgenda/listGoalkeeperAgendaQuery.js';
import { ListGoalkeeperAgendaQueryHandler } from '../application/features/goalkeeperRequests/queries/listGoalkeeperAgenda/listGoalkeeperAgendaQueryHandler.js';
import { GetGoalkeeperMonthStatsQuery } from '../application/features/goalkeepers/queries/getGoalkeeperMonthStats/getGoalkeeperMonthStatsQuery.js';
import { GetGoalkeeperMonthStatsQueryHandler } from '../application/features/goalkeepers/queries/getGoalkeeperMonthStats/getGoalkeeperMonthStatsQueryHandler.js';
import { AcceptBookingCommand } from '../application/features/goalkeeperRequests/commands/acceptBooking/acceptBookingCommand.js';
import { DismissBookingCommand } from '../application/features/goalkeeperRequests/commands/dismissBooking/dismissBookingCommand.js';
import { DismissBookingCommandHandler } from '../application/features/goalkeeperRequests/commands/dismissBooking/dismissBookingCommandHandler.js';
import { AcceptBookingCommandHandler } from '../application/features/goalkeeperRequests/commands/acceptBooking/acceptBookingCommandHandler.js';
import { MongoBookingAcceptanceStore } from './persistence/mongo/bookingAcceptanceStore.js';
import { ListAvailableBookingsQueryHandler } from '../application/features/goalkeeperRequests/queries/listAvailableBookings/listAvailableBookingsQueryHandler.js';
import { RecordOperatingBalanceAdjustmentCommand } from '../application/features/operatingBalance/commands/recordOperatingBalanceAdjustment/recordOperatingBalanceAdjustmentCommand.js';
import { RecordOperatingBalanceAdjustmentCommandHandler } from '../application/features/operatingBalance/commands/recordOperatingBalanceAdjustment/recordOperatingBalanceAdjustmentCommandHandler.js';
import { ApplyGatewayEventCommand } from '../application/features/payments/commands/applyGatewayEvent/applyGatewayEventCommand.js';
import { ApplyGatewayEventCommandHandler } from '../application/features/payments/commands/applyGatewayEvent/applyGatewayEventCommandHandler.js';
import { DepositReconcileJob } from '../application/features/deposits/jobs/depositReconcileJob.js';
import { ReconcileDepositCommand } from '../application/features/deposits/commands/reconcileDeposit/reconcileDepositCommand.js';
import { ReconcileDepositCommandHandler } from '../application/features/deposits/commands/reconcileDeposit/reconcileDepositCommandHandler.js';
import { ListDepositsQuery } from '../application/features/deposits/queries/listDeposits/listDepositsQuery.js';
import { ListDepositsQueryHandler } from '../application/features/deposits/queries/listDeposits/listDepositsQueryHandler.js';
import { GetDepositQuery } from '../application/features/deposits/queries/getDeposit/getDepositQuery.js';
import { GetDepositQueryHandler } from '../application/features/deposits/queries/getDeposit/getDepositQueryHandler.js';
import { GetDepositByReferenceQuery } from '../application/features/deposits/queries/getDepositByReference/getDepositByReferenceQuery.js';
import { GetDepositByReferenceQueryHandler } from '../application/features/deposits/queries/getDepositByReference/getDepositByReferenceQueryHandler.js';
import { SetGatewaySettingsCommand } from '../application/features/payments/commands/setGatewaySettings/setGatewaySettingsCommand.js';
import { SetGatewaySettingsCommandHandler } from '../application/features/payments/commands/setGatewaySettings/setGatewaySettingsCommandHandler.js';
import { GetGatewaySettingsQuery } from '../application/features/payments/queries/getGatewaySettings/getGatewaySettingsQuery.js';
import { GetGatewaySettingsQueryHandler } from '../application/features/payments/queries/getGatewaySettings/getGatewaySettingsQueryHandler.js';
import { TaxSettingsRepository } from './persistence/mongo/taxSettingsRepository.js';
import { createVatRateResolver } from '../application/features/operatingBalance/common/vatRateResolver.js';
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
import { RetryDocumentCommand } from '../application/features/invoicing/commands/retryDocument/retryDocumentCommand.js';
import { RetryDocumentCommandHandler } from '../application/features/invoicing/commands/retryDocument/retryDocumentCommandHandler.js';
import { GetDepositOptionsQuery } from '../application/features/deposits/queries/getDepositOptions/getDepositOptionsQuery.js';
import { GetDepositOptionsQueryHandler } from '../application/features/deposits/queries/getDepositOptions/getDepositOptionsQueryHandler.js';
import { StartDepositCommand } from '../application/features/deposits/commands/startDeposit/startDepositCommand.js';
import { StartDepositCommandHandler } from '../application/features/deposits/commands/startDeposit/startDepositCommandHandler.js';
import { SetLanguageCommand } from '../application/features/profile/commands/setLanguage/setLanguageCommand.js';
import { SetLanguageCommandHandler } from '../application/features/profile/commands/setLanguage/setLanguageCommandHandler.js';
import { GetPreferredLanguageQuery } from '../application/features/profile/queries/getPreferredLanguage/getPreferredLanguageQuery.js';
import { GetPreferredLanguageQueryHandler } from '../application/features/profile/queries/getPreferredLanguage/getPreferredLanguageQueryHandler.js';
import { UserLanguages } from '../application/features/users/common/userLanguages.js';
import { AcceptCurrentTermsCommand } from '../application/features/profile/commands/acceptCurrentTerms/acceptCurrentTermsCommand.js';
import { AcceptCurrentTermsCommandHandler } from '../application/features/profile/commands/acceptCurrentTerms/acceptCurrentTermsCommandHandler.js';
import { GetGoalkeeperOperatingBalanceQuery } from '../application/features/operatingBalance/queries/getGoalkeeperOperatingBalance/getGoalkeeperOperatingBalanceQuery.js';
import { GetGoalkeeperOperatingBalanceQueryHandler } from '../application/features/operatingBalance/queries/getGoalkeeperOperatingBalance/getGoalkeeperOperatingBalanceQueryHandler.js';
import { ListBalanceMovementsQuery } from '../application/features/operatingBalance/queries/listBalanceMovements/listBalanceMovementsQuery.js';
import { ListBalanceMovementsQueryHandler } from '../application/features/operatingBalance/queries/listBalanceMovements/listBalanceMovementsQueryHandler.js';
import { CommissionSettingRepository } from './persistence/mongo/commissionSettingRepository.js';
import { BalanceMovementRepository } from './persistence/mongo/balanceMovementRepository.js';
import { OperatingBalanceRepository } from './persistence/mongo/operatingBalanceRepository.js';
import { logger } from './observability/logger.js';
import { DepositRepository } from './persistence/mongo/depositRepository.js';
import { MongoDepositStore } from './persistence/mongo/depositStore.js';
import { PaymentGatewaySettingsRepository } from './persistence/mongo/paymentGatewaySettingsRepository.js';
import { PaymentGatewayRegistry } from './payments/gatewayRegistry.js';
import { EnvPaymentSecrets } from './payments/envPaymentSecrets.js';
import { WompiGateway } from './payments/wompiGateway.js';
import { MongoOperatingBalanceStore } from './persistence/mongo/operatingBalanceStore.js';
import { CityRepository } from './persistence/mongo/cityRepository.js';
import { RegionRepository } from './persistence/mongo/regionRepository.js';
import { ZoneRepository } from './persistence/mongo/zoneRepository.js';
import { MarketRepository } from './persistence/mongo/marketRepository.js';
import { ImageRepository } from './persistence/mongo/imageRepository.js';
import { GoogleIdTokenValidator } from './auth/googleIdTokenValidator.js';
import { JwtInternalTokenIssuer } from './auth/jwtInternalTokenIssuer.js';
import { GoogleSsoProviderCatalog } from './auth/googleSsoProviderCatalog.js';
import { DEFAULT_GOOGLE_SCOPES } from './auth/googleSsoOptions.js';
import { PinoAuditLogger } from './observability/pinoAuditLogger.js';
import { UuidIdGenerator } from './uuidIdGenerator.js';
import { SystemClock } from './systemClock.js';
import { RentalRateRepository } from './persistence/mongo/rentalRateRepository.js';
import { MatchSurfaceRepository } from './persistence/mongo/matchSurfaceRepository.js';
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
import type { IScheduledJob } from '../application/features/events/common/ports.js';
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
import { DeleteNotificationCommand } from '../application/features/notifications/commands/deleteNotification/deleteNotificationCommand.js';
import { DeleteNotificationCommandHandler } from '../application/features/notifications/commands/deleteNotification/deleteNotificationCommandHandler.js';
import { DeleteAllNotificationsCommand } from '../application/features/notifications/commands/deleteAllNotifications/deleteAllNotificationsCommand.js';
import { DeleteAllNotificationsCommandHandler } from '../application/features/notifications/commands/deleteAllNotifications/deleteAllNotificationsCommandHandler.js';
import { DismissOfferCommand } from '../application/features/notifications/commands/dismissOffer/dismissOfferCommand.js';
import { DismissOfferCommandHandler } from '../application/features/notifications/commands/dismissOffer/dismissOfferCommandHandler.js';
import { BookingExpiryJob } from '../application/features/bookingLifecycle/jobs/bookingExpiryJob.js';
import { CLIENT_OUTCOME_EVENT_TYPES, ClientOutcomeNoticeHandler } from '../application/features/bookingLifecycle/handlers/clientOutcomeNoticeHandler.js';
import { MongoBookingLifecycleStore } from './persistence/mongo/bookingLifecycleStore.js';
import { GoalkeeperIncidentRepository } from './persistence/mongo/goalkeeperIncidentRepository.js';
import { RatingRepository } from './persistence/mongo/ratingRepository.js';
import { CaseRepository } from './persistence/mongo/caseRepository.js';
import { staffHandlerRegistrations } from './staffHandlers.js';
import { geographyHandlerRegistrations } from './geographyHandlers.js';
import { pricingHandlerRegistrations } from './pricingHandlers.js';
import { usersHandlerRegistrations } from './usersHandlers.js';
import { UserBlockRepository } from './persistence/mongo/userBlockRepository.js';
import { AccountClosureRepository } from './persistence/mongo/accountClosureRepository.js';
import { ClosedAccountsService } from '../application/features/accountClosures/common/closedAccounts.js';
import { ClosureBlockersReader } from '../application/features/accountClosures/common/closureBlockersReader.js';
import { suggestDepositAmount } from '../application/features/accountClosures/common/depositSuggestion.js';
import { accountClosureHandlerRegistrations } from './accountClosureHandlers.js';
import { resolveGoalkeeperOperatingBalanceContext } from '../application/features/operatingBalance/common/goalkeeperOperatingBalanceContext.js';
import { usableSettings } from '../application/features/deposits/common/depositSetup.js';
import { UserAdminReader } from './persistence/mongo/userAdminReader.js';
import { GoalkeeperAdminReader } from './persistence/mongo/goalkeeperAdminReader.js';
import { MongoGoalkeeperDocumentWriter } from './persistence/mongo/goalkeeperDocumentWriter.js';
import { goalkeepersAdminHandlerRegistrations } from './goalkeepersAdminHandlers.js';
import { operationsHandlerRegistrations } from './operationsAdminHandlers.js';
import { RequestAdminReader } from './persistence/mongo/requestAdminReader.js';
import { NotificationAdminReader } from './persistence/mongo/notificationAdminReader.js';
import { DepositAdminReader } from './persistence/mongo/depositAdminReader.js';
import { OperatingBalanceAdminReader } from './persistence/mongo/operatingBalanceAdminReader.js';
import { InvoicingDocumentAdminReader } from './persistence/mongo/invoicingDocumentAdminReader.js';
import { financeHandlerRegistrations } from './financeAdminHandlers.js';
import { dashboardSystemHandlerRegistrations } from './dashboardSystemAdminHandlers.js';
import { readSystemParameters } from './systemParameterSource.js';
import { MongoDashboardReader } from './persistence/mongo/dashboardReader.js';
import { RatingAdminReader } from './persistence/mongo/ratingAdminReader.js';
import { PinoAdminSecurityLog } from './observability/pinoAdminSecurityLog.js';
import { loginCodeHandlerRegistrations } from './loginCodeHandlers.js';
import { realResponseTimer } from '../application/features/staff/common/responseFloor.js';
import { ResendEmailSender } from './email/resendEmailSender.js';
import { LogEmailSender } from './email/logEmailSender.js';
import { TemplateLoginCodeMailer } from './email/templateLoginCodeMailer.js';
import { HmacLoginCodeHasher } from './auth/hmacLoginCodeHasher.js';
import { CryptoOneTimeCodeGenerator } from './auth/cryptoOneTimeCodeGenerator.js';
import { MongoLoginCodeStore } from './persistence/mongo/loginCodeStore.js';
import { BackgroundCheckRepository } from './persistence/mongo/backgroundCheckRepository.js';
import { UnverifiedDiscountRepository } from './persistence/mongo/unverifiedDiscountRepository.js';
import { UnverifiedDiscountResolver } from '../application/features/pricing/common/unverifiedDiscountResolver.js';
import { VettingLogRepository } from './persistence/mongo/vettingLogRepository.js';
import { VettingNotifier } from '../application/features/goalkeepers/common/vettingNotifier.js';
import { ReputationVerifier } from '../application/features/goalkeepers/common/reputationVerifier.js';
import { goalkeeperVettingHandlerRegistrations } from './goalkeeperVettingHandlers.js';
import { MongoRateLimiter } from './persistence/mongo/mongoRateLimiter.js';
import { MongoAccessSettingsRepository } from './persistence/mongo/accessSettingsRepository.js';
import { JwtAdminTokenIssuer } from './auth/jwtAdminTokenIssuer.js';
import { StaffAccessResolver } from './auth/staffAccessResolver.js';
import { MongoAdminAuditLog } from './persistence/mongo/adminAuditLogRepository.js';
import { MongoStaffMemberRepository } from './persistence/mongo/staffMemberRepository.js';
import { MongoStaffRoleRepository } from './persistence/mongo/staffRoleRepository.js';
import { MongoAdminSessionStore } from './persistence/mongo/adminSessionStore.js';
import { CancelAllJob } from '../application/features/bookingLifecycle/jobs/cancelAllJob.js';
import { GOALKEEPER_CANCELLATION_EVENT_TYPES, GoalkeeperCancellationNoticeHandler } from '../application/features/bookingLifecycle/handlers/goalkeeperCancellationNoticeHandler.js';
import { CancelBookingsByClientCommand } from '../application/features/bookingLifecycle/commands/cancelBookingsByClient/cancelBookingsByClientCommand.js';
import { CancelBookingsByAdminCommand } from '../application/features/bookingLifecycle/commands/cancelBookingsByAdmin/cancelBookingsByAdminCommand.js';
import { CancelBookingsByAdminCommandHandler } from '../application/features/bookingLifecycle/commands/cancelBookingsByAdmin/cancelBookingsByAdminCommandHandler.js';
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
import { OFFER_WITHDRAWAL_EVENT_TYPES, OfferWithdrawalHandler } from '../application/features/notifications/handlers/offerWithdrawalHandler.js';
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
  // The language each person chose (feature 032), for notices, emails and the return page.
  const userLanguages = new UserLanguages(userRepository);
  const userBlockRepository = new UserBlockRepository(db);
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
  // Validation and verification (admin spec 030).
  const backgroundCheckRepository = new BackgroundCheckRepository(db);
  await backgroundCheckRepository.ensureIndexes();
  const vettingLogRepository = new VettingLogRepository(db);
  await vettingLogRepository.ensureIndexes();
  const unverifiedDiscountRepository = new UnverifiedDiscountRepository(db);
  await unverifiedDiscountRepository.ensureIndexes();
  const cityRepository = new CityRepository(db);
  await cityRepository.ensureIndexes();
  const regionRepository = new RegionRepository(db);
  await regionRepository.ensureIndexes();
  const marketRepository = new MarketRepository(db);
  await marketRepository.ensureIndexes();
  const zoneRepository = new ZoneRepository(db);
  // Admin spec 030: the discount and verified-only window of each zone, for the quote.
  const unverifiedDiscountResolver = new UnverifiedDiscountResolver(unverifiedDiscountRepository, zoneRepository, marketRepository);
  await zoneRepository.ensureIndexes();
  const rentalRateRepository = new RentalRateRepository(db);
  await rentalRateRepository.ensureIndexes();
  const matchSurfaceRepository = new MatchSurfaceRepository(db);
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
  await termsAcceptanceRepository.ensureIndexes();
  const caseRepository = new CaseRepository(db);
  await caseRepository.ensureIndexes();
  // Requests to leave the platform (feature 029).
  const accountClosureRepository = new AccountClosureRepository(db);
  await accountClosureRepository.ensureIndexes();
  // Admin web access (porteros-pro-admin spec 001): staff members, roles and sessions.
  const staffMemberRepository = new MongoStaffMemberRepository(db, () => connectionProvider.startSession());
  await staffMemberRepository.ensureIndexes();
  const staffRoleRepository = new MongoStaffRoleRepository(db, () => connectionProvider.startSession());
  await staffRoleRepository.ensureIndexes();
  await staffRoleRepository.ensureOwner(new Date());
  const adminSessionStore = new MongoAdminSessionStore(db);
  await adminSessionStore.ensureIndexes();
  const quoteConfirmationStore = new MongoQuoteConfirmationStore(() => connectionProvider.startSession(), db);
  const operatingBalanceRepository = new OperatingBalanceRepository(db);
  const balanceMovementRepository = new BalanceMovementRepository(db);
  await balanceMovementRepository.ensureIndexes();
  const commissionSettingRepository = new CommissionSettingRepository(db);
  await commissionSettingRepository.ensureIndexes();
  const commissionResolver = new CommissionResolver(commissionSettingRepository, zoneRepository, marketRepository);
  const operatingBalanceContext = { goalkeeperProfileRepository, marketRepository, countryLookup: countryRepository };
  // VAT on top of commissions (feature 023).
  const taxSettingsRepository = new TaxSettingsRepository(db);
  const vatRates = createVatRateResolver(taxSettingsRepository, { marketRepository }, logger);
  // Electronic invoicing (feature 023): providers per country, credentials from Secret Manager.
  const invoicingDocumentRepository = new InvoicingDocumentRepository(db);
  await invoicingDocumentRepository.ensureIndexes();
  await invoicingDocumentRepository.ensureAdminIndexes();
  await operatingBalanceRepository.ensureAdminIndexes();
  const invoicingSettingsRepository = new InvoicingSettingsRepository(db);
  const billableMovementScanner = new BillableMovementScanner(db);
  const invoicingProviders = new InvoicingProviderRegistry([new SiigoInvoicingProvider(config.invoicing.siigoBaseUrl)]);
  const invoicingSecrets = new EnvInvoicingSecrets(process.env);
  // Operating balance deposits (feature 022). Secrets come from the environment (Secret Manager), never the database.
  const depositRepository = new DepositRepository(db);
  await depositRepository.ensureIndexes();
  await depositRepository.ensureAdminIndexes();
  const paymentGatewaySettingsRepository = new PaymentGatewaySettingsRepository(db);
  await paymentGatewaySettingsRepository.ensureIndexes();
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
  const closedAccounts = new ClosedAccountsService(accountClosureRepository, clock);
  const adminTokenIssuer = new JwtAdminTokenIssuer({
    signingKey: config.jwt.signingKey,
    accessTokenLifetimeSeconds: config.admin.accessTokenLifetimeSeconds,
  });
  const staffAccessResolver = new StaffAccessResolver(adminSessionStore, staffMemberRepository, staffRoleRepository, clock);
  const adminAuditLog = new MongoAdminAuditLog(db);
  await adminAuditLog.ensureIndexes();
  const operatingBalanceStore = new MongoOperatingBalanceStore(() => connectionProvider.startSession(), db, () => clock.now());
  const operatingBalanceLedger = new OperatingBalanceLedger(operatingBalanceStore, balanceMovementRepository, idGenerator, clock);
  const depositStore = new MongoDepositStore(() => connectionProvider.startSession(), db, () => idGenerator.newId());
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
    movements: balanceMovementRepository,
    users: userRepository,
    operatingBalanceContext,
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

  // Sign-in codes by email (porteros-pro-admin spec 009): the provider sits behind IEmailSender.
  // The admin web's code requests answer no sooner than this, member or not (research §7).
  const ADMIN_EMAIL_CODE_MIN_RESPONSE_MS = 800;
  assertEmailConfig();
  const emailSender =
    config.email.mode === 'resend' ? new ResendEmailSender({ apiKey: config.email.apiKey, from: config.email.from }) : new LogEmailSender();
  logger.info({ email_mode: config.email.mode }, 'Email configured');
  const loginCodeStore = new MongoLoginCodeStore(db);
  await loginCodeStore.ensureIndexes();
  const loginCodeLimiter = new MongoRateLimiter(db);
  await loginCodeLimiter.ensureIndexes();
  const accessSettingsRepository = new MongoAccessSettingsRepository(db);
  const loginCodes = {
    codes: loginCodeStore,
    mailer: new TemplateLoginCodeMailer(emailSender, config.email.loginCodeTemplateId),
    hasher: new HmacLoginCodeHasher(config.jwt.signingKey),
    generator: new CryptoOneTimeCodeGenerator(),
    limiter: loginCodeLimiter,
    settings: accessSettingsRepository,
    ids: idGenerator,
    clock,
  };
  registerHandlers(
    mediator,
    loginCodeHandlerRegistrations({
      loginCodes,
      appLog: auditLogger,
      accessSettings: accessSettingsRepository,
      users: userRepository,
      admin: {
        members: staffMemberRepository,
        sessions: adminSessionStore,
        tokens: adminTokenIssuer,
        ids: idGenerator,
        clock,
        securityLog: new PinoAdminSecurityLog(),
        timer: realResponseTimer,
        minResponseMs: ADMIN_EMAIL_CODE_MIN_RESPONSE_MS,
      },
      appSession: {
        refreshTokenRepository,
        tokenIssuer,
        goalkeeperProfileRepository,
        idGenerator,
        refreshTokenLifetimeMs,
        blockedUsers: userBlockRepository,
        closedAccounts,
      },
    }),
  );

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
  const offerEligibility = new OfferEligibilityService({ goalkeeperProfileRepository, operatingBalanceRepository, commissionResolver, bookingRepository, vatRates });
  const offerSender = new OfferSender({
    userLanguages,
    notifications: notificationRepository,
    pushState: offerPushState,
    pushNotifier,
    idGenerator,
    requestRepository,
    zoneRepository,
    marketRepository,
    bookingSettingsRepository,
    logger,
    // The environment values are the platform level; a country or a market may override them (spec 031, research §6).
    platformReminders: { maxReminders: config.offers.maxReminders, intervalMinutes: config.offers.reminderIntervalMinutes },
  });
  const offersHandler = new NotifyBookingOffersHandler(mediator, processedEventStore, clock);
  // Booking expiry and "cancel all" (feature 016).
  const lifecycleStore = new MongoBookingLifecycleStore(() => connectionProvider.startSession(), db);
  const bookingExpiryJob = new BookingExpiryJob({ bookingRepository, store: lifecycleStore, relay: eventRelay, idGenerator, logger });
  const clientOutcomeNotices = new ClientOutcomeNoticeHandler({
    userLanguages,
    requestRepository,
    bookingRepository,
    zoneRepository,
    marketRepository,
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
    operatingBalanceContext,
    relay: eventRelay,
    idGenerator: idGenerator,
    logger: logger,
  });
  const goalkeeperCancellationNotices = new GoalkeeperCancellationNoticeHandler({
    userLanguages,
    requestRepository,
    zoneRepository,
    marketRepository,
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
    userLanguages,
    requestRepository,
    zoneRepository,
    marketRepository,
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
        userLanguages,
        requestRepository,
        zoneRepository,
        marketRepository,
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
        userLanguages,
        requestRepository,
        zoneRepository,
        marketRepository,
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
    userLanguages,
      requestRepository,
      bookingRepository,
      userRepository,
      zoneRepository,
      marketRepository,
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
  const offerWithdrawals = new OfferWithdrawalHandler({
    notifications: notificationRepository,
    pushNotifier,
    processed: processedEventStore,
    clock,
    logger,
  });
  registerSubscribers(
    mediator,
    OFFER_WITHDRAWAL_EVENT_TYPES.map((type) => ({ type, handler: offerWithdrawals })),
  );
  logger.info({ push_mode: config.push.mode }, 'Push notifications configured');
  if (process.env.NODE_ENV === 'production' && config.push.mode === 'log') {
    logger.warn({ push_mode: 'log' }, 'Push notifications are only logged in production: nothing reaches devices');
  }

  registerHandlers(
    mediator,
    staffHandlerRegistrations({
      google: googleValidator,
      users: userRepository,
      members: staffMemberRepository,
      roles: staffRoleRepository,
      sessions: adminSessionStore,
      tokens: adminTokenIssuer,
      ids: idGenerator,
      clock,
      securityLog: new PinoAdminSecurityLog(),
      accessResolver: staffAccessResolver,
      auditLog: adminAuditLog,
      places: { markets: marketRepository, countries: countryRepository },
    }),
  );
  const referenceUsage = new MongoReferenceUsage(db);
  const adminCountryRepository = new MongoAdminCountryRepository(db);
  registerHandlers(
    mediator,
    geographyHandlerRegistrations({
      countries: adminCountryRepository,
      regions: regionRepository,
      cities: cityRepository,
      markets: marketRepository,
      zones: zoneRepository,
      usage: referenceUsage,
      marketUsage: referenceUsage,
      futureBookings: referenceUsage,
      bookingSettings: bookingSettingsRepository,
      rentalRates: rentalRateRepository,
      commissions: commissionSettingRepository,
      taxSettings: taxSettingsRepository,
      gatewaySettings: paymentGatewaySettingsRepository,
      invoicingSettings: invoicingSettingsRepository,
      documentTypes: documentTypeRepository,
      surfaces: matchSurfaceRepository,
      ids: idGenerator,
      clock,
    }),
  );
  registerHandlers(
    mediator,
    pricingHandlerRegistrations({
      countryLookup: countryRepository,
      rentalRateRepository,
      bookingSettingsRepository,
      commissionResolver,
      countries: adminCountryRepository,
      markets: marketRepository,
      zones: zoneRepository,
      rentalRates: rentalRateRepository,
      commissions: commissionSettingRepository,
      bookingSettings: bookingSettingsRepository,
      platformReminders: { maxReminders: config.offers.maxReminders, intervalMinutes: config.offers.reminderIntervalMinutes },
      discounts: unverifiedDiscountRepository,
      taxSettings: taxSettingsRepository,
      ids: idGenerator,
      clock,
    }),
  );
  const userAdminReader = new UserAdminReader(db);
  const goalkeeperAdminReader = new GoalkeeperAdminReader(db);
  registerHandlers(
    mediator,
    accountClosureHandlerRegistrations({
      closures: accountClosureRepository,
      userSearch: userAdminReader,
      users: userRepository,
      profiles: goalkeeperProfileRepository,
      balanceContext: operatingBalanceContext,
      balances: operatingBalanceRepository,
      movements: balanceMovementRepository,
      ledger: operatingBalanceLedger,
      blockers: new ClosureBlockersReader({
        bookings: bookingRepository,
        requests: requestRepository,
        zones: zoneRepository,
        deposits: depositRepository,
        cases: caseRepository,
        clock,
      }),
      notices: { notifications: notificationRepository, pushNotifier, idGenerator, clock, userLanguages },
      devices: deviceRepository,
      suggestDepositAmount: async (goalkeeperId, debt) => {
        const context = await resolveGoalkeeperOperatingBalanceContext(operatingBalanceContext, goalkeeperId);
        if (context.kind !== 'ok') return null;
        const settings = await usableSettings(paymentGatewaySettingsRepository, { countryId: context.countryId, marketId: context.profile.marketId }, context.currency);
        return settings ? suggestDepositAmount(settings.options(), debt) : null;
      },
      idGenerator,
      clock,
    }),
  );
  registerHandlers(
    mediator,
    usersHandlerRegistrations({
      users: userRepository,
      contacts: userRepository,
      profiles: goalkeeperProfileRepository,
      blocks: userBlockRepository,
      countries: countryRepository,
      staff: staffMemberRepository,
      goalkeeperReader: goalkeeperAdminReader,
      zones: zoneRepository,
      markets: marketRepository,
      clock,
      reader: userAdminReader,
      closures: accountClosureRepository,
    }),
  );
  registerHandlers(
    mediator,
    goalkeepersAdminHandlerRegistrations({
      reader: goalkeeperAdminReader,
      userReader: userAdminReader,
      users: userRepository,
      blocks: userBlockRepository,
      profiles: goalkeeperProfileRepository,
      markets: marketRepository,
      zones: zoneRepository,
      documentTypes: documentTypeRepository,
      monthStats: (goalkeeperId) => mediator.send(new GetGoalkeeperMonthStatsQuery(goalkeeperId)),
      clock,
      registrations: goalkeeperRegistrationRepository,
      images: imageRepository,
      documentWriter: new MongoGoalkeeperDocumentWriter(() => connectionProvider.startSession(), db),
      places: { cities: cityRepository, regions: regionRepository },
    }),
  );
  // Validation and verification (admin spec 030): the notices and the reputation seal.
  const vettingNotifier = new VettingNotifier({ notifications: notificationRepository, pushNotifier, idGenerator, clock, userLanguages, logger });
  const reputationVerifier = new ReputationVerifier({
    profiles: goalkeeperProfileRepository,
    checks: backgroundCheckRepository,
    log: vettingLogRepository,
    notifier: vettingNotifier,
    idGenerator,
    clock,
    ratings: ratingRepository,
  });
  registerHandlers(
    mediator,
    goalkeeperVettingHandlerRegistrations({
      profiles: goalkeeperProfileRepository,
      checks: backgroundCheckRepository,
      log: vettingLogRepository,
      notifier: vettingNotifier,
      reputation: reputationVerifier,
      idGenerator,
      clock,
      images: imageRepository,
      sender: mediator,
      staff: staffMemberRepository,
      users: userRepository,
      ratings: ratingRepository,
      blocks: userBlockRepository,
      userReader: userAdminReader,
      markets: marketRepository,
    }),
  );
  registerHandlers(
    mediator,
    operationsHandlerRegistrations({
      reader: new RequestAdminReader(db),
      users: userRepository,
      markets: marketRepository,
      zones: zoneRepository,
      staff: staffMemberRepository,
      clock,
      cases: caseRepository,
      ratings: ratingRepository,
      requests: requestRepository,
      send: (query) => mediator.send(query),
      notificationReader: new NotificationAdminReader(db),
      ratingReader: new RatingAdminReader(db),
    }),
  );
  registerHandlers(
    mediator,
    financeHandlerRegistrations({
      depositReader: new DepositAdminReader(db),
      operatingBalanceReader: new OperatingBalanceAdminReader(db),
      markets: marketRepository,
      documentReader: new InvoicingDocumentAdminReader(db),
      documents: invoicingDocumentRepository,
      clock,
      issuingEnabled: config.invoicing.enabled,
      users: userRepository,
      countries: countryRepository,
    }),
  );
  // The sweep's jobs, built once: the sweep runs them and the admin's Sistema shows their leases (admin spec 008).
  const scheduledJobs: IScheduledJob[] = [
    cancelAllJob,
    bookingExpiryJob,
    new BookingCompletionJob({ bookingRepository, store: lifecycleStore, relay: eventRelay, idGenerator, logger }),
    new NoShowWatchJob({
      operatingBalanceContext,
      bookingSettingsRepository,
      logger: logger,
      bookingRepository,
      requestRepository,
      store: lifecycleStore,
      relay: eventRelay,
      idGenerator: idGenerator,
      clock,
      graceResolver: () => createNoShowGraceResolver({ marketRepository, bookingSettingsRepository, logger: logger }),
    }),
    new OfferRemindersJob({ bookingRepository, eligibility: offerEligibility, sender: offerSender, logger: logger, roundCap: config.offers.roundCap }),
    new ContactsRevealJob({
      userLanguages,
      requestRepository,
      bookingRepository,
      userRepository,
      zoneRepository,
      marketRepository,
      notifications: notificationRepository,
      pushNotifier,
      idGenerator: idGenerator,
      clock,
      logger: logger,
    }),
    new CheckInWatchJob({
      userLanguages,
      bookingRepository,
      requestRepository,
      userRepository,
      zoneRepository,
      marketRepository,
      notifications: notificationRepository,
      pushNotifier,
      idGenerator: idGenerator,
      clock,
      logger: logger,
      windowResolver: () => createCheckInWindowResolver({ marketRepository, bookingSettingsRepository, logger: logger }),
    }),
    new DepositReconcileJob({
      operatingBalanceContext,
      store: depositStore,
      notices: { notifications: notificationRepository, pushNotifier, idGenerator: idGenerator, clock, userLanguages },
      logger: logger,
      depositRepository,
      gateways: paymentGatewayRegistry,
      secrets: paymentSecrets,
      countryLookup: countryRepository,
    }),
    new InvoicingIssuerJob({ ...invoicingDeps, scanner: billableMovementScanner, cap: config.invoicing.issuerCap }),
  ];
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
        userBlockRepository,
        closedAccounts,
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
        userBlockRepository,
        closedAccounts,
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
      handler: new GetCitiesQueryHandler(cityRepository, regionRepository),
    },
    { requestType: GetZonesByMarketQuery, handler: new GetZonesByMarketQueryHandler(marketRepository, zoneRepository) },
    { requestType: ListEnabledMarketsQuery, handler: new ListEnabledMarketsQueryHandler(marketRepository) },
    {
      requestType: GetBookingConfigQuery,
      handler: new GetBookingConfigQueryHandler(
        zoneRepository,
        marketRepository,
        countryRepository,
        bookingSettingsRepository,
        clock,
        matchSurfaceRepository,
      ),
    },
    {
      requestType: GetServiceQuoteQuery,
      handler: new GetServiceQuoteQueryHandler(
        zoneRepository,
        marketRepository,
        countryRepository,
        rentalRateRepository,
        bookingSettingsRepository,
        commissionResolver,
        clock,
        matchSurfaceRepository,
      ),
    },
    {
      requestType: IssueServiceQuoteCommand,
      handler: new IssueServiceQuoteCommandHandler(mediator, quoteRepository, idGenerator, clock, unverifiedDiscountResolver),
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
        marketRepository,
      ),
    },
    {
      requestType: ListClientRequestsQuery,
      handler: new ListClientRequestsQueryHandler(
        requestRepository,
        bookingRepository,
        zoneRepository,
        marketRepository,
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
      requestType: GetGoalkeeperOperatingBalanceQuery,
      handler: new GetGoalkeeperOperatingBalanceQueryHandler(operatingBalanceContext, operatingBalanceRepository, commissionResolver, clock, vatRates),
    },
    {
      requestType: GetDepositOptionsQuery,
      handler: new GetDepositOptionsQueryHandler(operatingBalanceContext, paymentGatewaySettingsRepository, termsAcceptanceRepository, config.legal),
    },
    {
      requestType: StartDepositCommand,
      handler: new StartDepositCommandHandler({
        context: operatingBalanceContext,
        settingsRepository: paymentGatewaySettingsRepository,
        termsRepository: termsAcceptanceRepository,
        gateways: paymentGatewayRegistry,
        secrets: paymentSecrets,
        depositRepository,
        idGenerator,
        clock,
        logger,
        settings: { termsVersion: config.legal.termsVersion, publicBaseUrl: config.payments.publicBaseUrl },
      }),
    },
    {
      requestType: ApplyGatewayEventCommand,
      handler: new ApplyGatewayEventCommandHandler({
        operatingBalanceContext,
        store: depositStore,
        notices: { notifications: notificationRepository, pushNotifier, idGenerator: idGenerator, clock, userLanguages },
        logger: logger,
        gateways: paymentGatewayRegistry,
        secrets: paymentSecrets,
        depositRepository,
        countryLookup: countryRepository,
        clock,
      }),
    },
    { requestType: ListDepositsQuery, handler: new ListDepositsQueryHandler(goalkeeperProfileRepository, depositRepository) },
    { requestType: GetDepositQuery, handler: new GetDepositQueryHandler(depositRepository) },
    { requestType: GetDepositByReferenceQuery, handler: new GetDepositByReferenceQueryHandler(depositRepository, userLanguages) },
    {
      requestType: SetGatewaySettingsCommand,
      handler: new SetGatewaySettingsCommandHandler(countryRepository, paymentGatewaySettingsRepository, paymentSecrets, clock, logger, marketRepository),
    },
    { requestType: GetGatewaySettingsQuery, handler: new GetGatewaySettingsQueryHandler(paymentGatewaySettingsRepository, paymentSecrets, countryRepository) },
    {
      requestType: ListGatewaySettingsQuery,
      handler: new ListGatewaySettingsQueryHandler({ settingsRepository: paymentGatewaySettingsRepository, secrets: paymentSecrets, countryLookup: countryRepository, markets: marketRepository }),
    },
    { requestType: DeleteMarketGatewayOverrideCommand, handler: new DeleteMarketGatewayOverrideCommandHandler(paymentGatewaySettingsRepository) },
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
    {
      // "Conciliar ahora" (admin spec 007): the sweep's ask for one deposit, by a member.
      requestType: ReconcileDepositCommand,
      handler: new ReconcileDepositCommandHandler({
        operatingBalanceContext,
        store: depositStore,
        notices: { notifications: notificationRepository, pushNotifier, idGenerator: idGenerator, clock, userLanguages },
        logger: logger,
        depositRepository,
        gateways: paymentGatewayRegistry,
        secrets: paymentSecrets,
        countryLookup: countryRepository,
        clock,
      }),
    },
    {
      requestType: RetryDocumentCommand,
      handler: new RetryDocumentCommandHandler({ ...invoicingDeps, profiles: goalkeeperProfileRepository }),
    },
    {
      requestType: AcceptCurrentTermsCommand,
      handler: new AcceptCurrentTermsCommandHandler(termsAcceptanceRepository, idGenerator, clock, config.legal),
    },
    { requestType: SetLanguageCommand, handler: new SetLanguageCommandHandler(userRepository) },
    { requestType: GetPreferredLanguageQuery, handler: new GetPreferredLanguageQueryHandler(userLanguages) },
    {
      requestType: RecordOperatingBalanceAdjustmentCommand,
      handler: new RecordOperatingBalanceAdjustmentCommandHandler(operatingBalanceContext, operatingBalanceLedger, operatingBalanceRepository, {
        notifications: notificationRepository,
        pushNotifier,
        idGenerator,
        clock,
        userLanguages,
      }),
    },
    {
      requestType: DismissBookingCommand,
      handler: new DismissBookingCommandHandler(goalkeeperProfileRepository, bookingRepository),
    },
    {
      requestType: AcceptBookingCommand,
      handler: new AcceptBookingCommandHandler({
        operatingBalanceContext,
        operatingBalanceRepository: operatingBalanceRepository,
        bookingRepository,
        requestRepository,
        zoneRepository,
        marketRepository,
        userRepository,
        store: new MongoBookingAcceptanceStore(() => connectionProvider.startSession(), db),
        idGenerator: idGenerator,
        clock,
        audit: auditLogger,
        relay: eventRelay,
        vatRates,
        windowResolver: () => createCheckInWindowResolver({ marketRepository, bookingSettingsRepository, logger: logger }),
      }),
    },
    {
      requestType: ListAvailableBookingsQuery,
      handler: new ListAvailableBookingsQueryHandler({
        vatRates,
        goalkeeperProfileRepository,
        operatingBalanceRepository: operatingBalanceRepository,
        commissionResolver,
        bookingRepository,
        requestRepository: requestRepository,
        zoneRepository,
        marketRepository,
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
        marketRepository,
        userRepository,
        clock,
        windowResolver: () => createCheckInWindowResolver({ marketRepository, bookingSettingsRepository, logger: logger }),
      }),
    },
    {
      // The goalkeeper's month in numbers (feature 026).
      requestType: GetGoalkeeperMonthStatsQuery,
      handler: new GetGoalkeeperMonthStatsQueryHandler({ context: operatingBalanceContext, bookingRepository, clock }),
    },
    {
      requestType: ListBalanceMovementsQuery,
      handler: new ListBalanceMovementsQueryHandler(goalkeeperProfileRepository, operatingBalanceRepository, balanceMovementRepository),
    },
    {
      requestType: GetGoalkeeperRegistrationQuery,
      handler: new GetGoalkeeperRegistrationQueryHandler(
        goalkeeperRegistrationRepository,
        goalkeeperProfileRepository,
        marketRepository,
        { checks: backgroundCheckRepository, clock, discounts: unverifiedDiscountResolver },
        { cities: cityRepository, regions: regionRepository },
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
      requestType: SaveBillingSectionCommand,
      handler: new SaveBillingSectionCommandHandler(goalkeeperRegistrationRepository, cityRepository, idGenerator),
    },
    {
      requestType: UpdateGoalkeeperBillingCommand,
      handler: new UpdateGoalkeeperBillingCommandHandler(goalkeeperProfileRepository, goalkeeperRegistrationRepository, cityRepository),
    },
    {
      requestType: SaveAvailabilitySectionCommand,
      handler: new SaveAvailabilitySectionCommandHandler(goalkeeperRegistrationRepository, marketRepository, zoneRepository, idGenerator),
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
        marketRepository,
        zoneRepository,
      ),
    },
    {
      requestType: ChangeGoalkeeperMarketCommand,
      handler: new ChangeGoalkeeperMarketCommandHandler({
        profiles: goalkeeperProfileRepository,
        registrations: goalkeeperRegistrationRepository,
        markets: marketRepository,
        zones: zoneRepository,
        countries: countryRepository,
        store: new MongoGoalkeeperMarketChangeStore(() => connectionProvider.startSession(), db, goalkeeperProfileRepository),
        clock,
      }),
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
        jobs: scheduledJobs,
        jobLocks: jobLockStore,
      }),
    },
    {
      requestType: SetOffersAvailabilityCommand,
      handler: new SetOffersAvailabilityCommandHandler({ goalkeeperProfileRepository, eligibility: offerEligibility, sender: offerSender, clock, logger, blocks: userBlockRepository }),
    },
    {
      requestType: ListNotificationsQuery,
      handler: new ListNotificationsQueryHandler({ notifications: notificationRepository, eligibility: offerEligibility, clock }),
    },
    { requestType: MarkNotificationReadCommand, handler: new MarkNotificationReadCommandHandler(notificationRepository, clock) },
    { requestType: MarkAllNotificationsReadCommand, handler: new MarkAllNotificationsReadCommandHandler(notificationRepository, clock) },
    { requestType: DismissOfferCommand, handler: new DismissOfferCommandHandler(notificationRepository, clock) },
    { requestType: DeleteNotificationCommand, handler: new DeleteNotificationCommandHandler(notificationRepository, clock) },
    { requestType: DeleteAllNotificationsCommand, handler: new DeleteAllNotificationsCommandHandler(notificationRepository, clock) },
    {
      requestType: CancelBookingsByClientCommand,
      handler: new CancelBookingsByClientCommandHandler({
        requestRepository,
        bookingRepository,
        userRepository,
        store: lifecycleStore,
        operatingBalanceContext,
        relay: eventRelay,
        idGenerator: idGenerator,
        clock,
        audit: auditLogger,
        logger: logger,
      }),
    },
    {
      // The administrator's cancellation (admin spec 006): the client's transaction, the administrator's policy.
      requestType: CancelBookingsByAdminCommand,
      handler: new CancelBookingsByAdminCommandHandler({
        bookingRepository,
        store: lifecycleStore,
        operatingBalanceContext,
        relay: eventRelay,
        idGenerator: idGenerator,
        clock,
        audit: auditLogger,
        logger: logger,
      }),
    },
    {
      requestType: ListGoalkeeperWithdrawalsQuery,
      handler: new ListGoalkeeperWithdrawalsQueryHandler({
        goalkeeperProfileRepository,
        incidents: goalkeeperIncidentRepository,
        clock,
        adminDetails: new WithdrawalAdminDetails({ bookings: bookingRepository, zones: zoneRepository, markets: marketRepository, movements: balanceMovementRepository }),
      }),
    },
    {
      requestType: ReverseWithdrawalPenaltyCommand,
      handler: new ReverseWithdrawalPenaltyCommandHandler({ operatingBalanceContext, store: lifecycleStore, idGenerator: idGenerator, clock, audit: auditLogger, logger: logger }),
    },
    {
      requestType: CheckInToBookingCommand,
      handler: new CheckInToBookingCommandHandler({
        goalkeeperProfileRepository,
        imageRepository,
        bookingRepository,
        requestRepository,
        zoneRepository,
        marketRepository,
        userRepository,
        windowResolver: () => createCheckInWindowResolver({ marketRepository, bookingSettingsRepository, logger: logger }),
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
        operatingBalanceContext,
        bookingSettingsRepository,
        logger: logger,
        bookingRepository,
        store: lifecycleStore,
        relay: eventRelay,
        idGenerator: idGenerator,
        clock,
        audit: auditLogger,
        reputation: reputationVerifier,
        onReputationFailure: (error) => logger.warn({ outcome: 'reputation_evaluation_failed', error: error instanceof Error ? error.message : String(error) }, 'Reputation could not be evaluated after a rating'),
      }),
    },
    {
      requestType: ListPendingRatingsQuery,
      handler: new ListPendingRatingsQueryHandler({ bookingRepository, ratingRepository: ratingRepository, requestRepository, zoneRepository, marketRepository, userRepository, clock }),
    },
    { requestType: ListCasesQuery, handler: new ListCasesQueryHandler(caseRepository) },
    { requestType: GetCaseQuery, handler: new GetCaseQueryHandler(caseRepository, ratingRepository) },
    { requestType: ResolveCaseCommand, handler: new ResolveCaseCommandHandler(caseRepository, ratingRepository, clock, auditLogger) },
    {
      requestType: WithdrawFromBookingCommand,
      handler: new WithdrawFromBookingCommandHandler({
        operatingBalanceContext,
        bookingSettingsRepository,
        store: lifecycleStore,
        bookingRepository,
        requestRepository,
        zoneRepository,
        marketRepository,
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
        userLanguages,
      }),
    },
    {
      requestType: CancelGoalkeeperRegistrationCommand,
      handler: new CancelGoalkeeperRegistrationCommandHandler(mediator, goalkeeperRegistrationRepository),
    },
  ]);
  // Dashboard and system (admin spec 008): reads only.
  registerHandlers(
    mediator,
    dashboardSystemHandlerRegistrations({
      dashboardReader: new MongoDashboardReader(db),
      countries: adminCountryRepository,
      markets: marketRepository,
      clock,
      logger,
      outbox: outboxStore,
      jobs: scheduledJobs,
      jobLocks: jobLockStore,
      checkHealth: () => mongoHealthCheck.check(),
      stuckAfterMinutes: config.events.pendingWarningMinutes,
      parameters: {
        parameters: () => readSystemParameters(process.env),
        gatewaySettings: paymentGatewaySettingsRepository,
        invoicingSettings: invoicingSettingsRepository,
        paymentSecrets,
        invoicingSecrets,
      },
    }),
  );

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
      admin: {
        verifyAccessToken: (token) => adminTokenIssuer.verifyAccessToken(token),
        accessResolver: staffAccessResolver,
        auditLog: adminAuditLog,
        scope: { markets: marketRepository, countries: countryRepository },
        allowedOrigins: config.admin.allowedOrigins,
        sessionCookieSecure: config.admin.sessionCookieSecure,
        newId: () => idGenerator.newId(),
        now: () => clock.now(),
      },
    },
    close: async () => {
      await connectionProvider.close();
    },
  };
}
