import { ListGatewaySettingsQuery } from '../../src/application/features/payments/queries/listGatewaySettings/listGatewaySettingsQuery.js';
import { ListGatewaySettingsQueryHandler } from '../../src/application/features/payments/queries/listGatewaySettings/listGatewaySettingsQueryHandler.js';
import { DeleteMarketGatewayOverrideCommand } from '../../src/application/features/payments/commands/deleteMarketGatewayOverride/deleteMarketGatewayOverrideCommand.js';
import { DeleteMarketGatewayOverrideCommandHandler } from '../../src/application/features/payments/commands/deleteMarketGatewayOverride/deleteMarketGatewayOverrideCommandHandler.js';
import { ClosedAccountsService } from '../../src/application/features/accountClosures/common/closedAccounts.js';
import { accountClosureHandlerRegistrations } from '../../src/infrastructure/accountClosureHandlers.js';
import { FakeAccountClosureRepository } from '../fakes/fakeAccountClosureRepository.js';
import { FakeClosureBlockersReader } from '../fakes/fakeClosureBlockersReader.js';
import type { Server } from 'node:http';
import { WithdrawalAdminDetails } from '../../src/application/features/bookingLifecycle/common/withdrawalAdminDetails.js';
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
import type { IScheduledJob } from '../../src/application/features/events/common/ports.js';
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
import { staffHandlerRegistrations } from '../../src/infrastructure/staffHandlers.js';
import { geographyHandlerRegistrations } from '../../src/infrastructure/geographyHandlers.js';
import { pricingHandlerRegistrations } from '../../src/infrastructure/pricingHandlers.js';
import { usersHandlerRegistrations } from '../../src/infrastructure/usersHandlers.js';
import { FakeUserBlockRepository } from '../fakes/fakeUserBlockRepository.js';
import { FakeUserAdminReader } from '../fakes/fakeUserAdminReader.js';
import { FakeGoalkeeperAdminReader } from '../fakes/fakeGoalkeeperAdminReader.js';
import { FakeGoalkeeperDocumentWriter } from '../fakes/fakeGoalkeeperDocumentWriter.js';
import { GetGoalkeeperMonthStatsQuery as AdminMonthStatsQuery } from '../../src/application/features/goalkeepers/queries/getGoalkeeperMonthStats/getGoalkeeperMonthStatsQuery.js';
import { goalkeepersAdminHandlerRegistrations } from '../../src/infrastructure/goalkeepersAdminHandlers.js';
import { goalkeeperVettingHandlerRegistrations } from '../../src/infrastructure/goalkeeperVettingHandlers.js';
import { VettingNotifier } from '../../src/application/features/goalkeepers/common/vettingNotifier.js';
import { ReputationVerifier } from '../../src/application/features/goalkeepers/common/reputationVerifier.js';
import { FakeBackgroundCheckRepository } from '../fakes/fakeBackgroundCheckRepository.js';
import { FakeVettingLogRepository } from '../fakes/fakeVettingLogRepository.js';
import { FakeUnverifiedDiscountRepository } from '../fakes/fakeUnverifiedDiscountRepository.js';
import { UnverifiedDiscountResolver } from '../../src/application/features/pricing/common/unverifiedDiscountResolver.js';
import { operationsHandlerRegistrations } from '../../src/infrastructure/operationsAdminHandlers.js';
import { financeHandlerRegistrations } from '../../src/infrastructure/financeAdminHandlers.js';
import { dashboardSystemHandlerRegistrations } from '../../src/infrastructure/dashboardSystemAdminHandlers.js';
import { FakeDashboardReader } from '../fakes/fakeDashboardReader.js';
import { readSystemParameters } from '../../src/infrastructure/systemParameterSource.js';
import { loginCodeHandlerRegistrations } from '../../src/infrastructure/loginCodeHandlers.js';
import { HmacLoginCodeHasher } from '../../src/infrastructure/auth/hmacLoginCodeHasher.js';
import { FakeLoginCodeMailer } from '../fakes/fakeLoginCodeMailer.js';
import { FakeLoginCodeStore } from '../fakes/fakeLoginCodeStore.js';
import { FakeDurableRateLimiter } from '../fakes/fakeDurableRateLimiter.js';
import { FakeAccessSettingsRepository } from '../fakes/fakeAccessSettingsRepository.js';

/** The server environment Sistema reads in the HTTP tests (admin spec 008): secrets that must never show. */
export const TEST_SYSTEM_ENV = {
  MONGODB_CONNECTION_STRING: 'mongodb+srv://porteros:TestOnlyPass42@cluster.test/app',
  JWT_SIGNING_KEY: 'test-only-signing-key-9f8e7d6c5b4a',
  LEGAL_TERMS_VERSION: '1.2',
};
import { ReconcileDepositCommand } from '../../src/application/features/deposits/commands/reconcileDeposit/reconcileDepositCommand.js';
import { ReconcileDepositCommandHandler } from '../../src/application/features/deposits/commands/reconcileDeposit/reconcileDepositCommandHandler.js';
import { FakeDepositAdminReader } from '../fakes/fakeDepositAdminReader.js';
import { FakeOperatingBalanceAdminReader } from '../fakes/fakeOperatingBalanceAdminReader.js';
import { FakeInvoicingDocumentAdminReader } from '../fakes/fakeInvoicingDocumentAdminReader.js';
import { FakeRequestAdminReader } from '../fakes/fakeRequestAdminReader.js';
import { FakeNotificationAdminReader } from '../fakes/fakeNotificationAdminReader.js';
import { FakeRatingAdminReader } from '../fakes/fakeRatingAdminReader.js';
import { FakeBookingSettingsAdmin, FakeCommissionAdmin, FakeRentalRateAdmin } from '../fakes/fakePricingAdmin.js';
import {
  FakeAdminCityRepository,
  FakeAdminCountryRepository,
  FakeAdminDocumentTypeRepository,
  FakeAdminMatchSurfaceRepository,
  FakeAdminRegionRepository,
  FakeAdminZoneRepository,
} from '../fakes/fakeAdminGeography.js';
import { FakeFutureBookingsProbe, FakeReferenceUsage } from '../fakes/fakeReferenceUsage.js';
import { FakeMarketUsage } from '../fakes/fakeMarketUsage.js';
import { FakeAdminSecurityLog } from '../fakes/fakeAdminSecurityLog.js';
import { FakeStaffMemberRepository } from '../fakes/fakeStaffMemberRepository.js';
import { FakeStaffRoleRepository } from '../fakes/fakeStaffRoleRepository.js';
import { FakeAdminSessionStore } from '../fakes/fakeAdminSessionStore.js';
import { FakeAdminTokenIssuer } from '../fakes/fakeAdminTokenIssuer.js';
import { FakeAdminAuditLog } from '../fakes/fakeAdminAuditLog.js';
import { StaffAccessResolver } from '../../src/infrastructure/auth/staffAccessResolver.js';
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
import { FakeOperatingBalanceStore } from '../fakes/fakeOperatingBalanceStore.js';
import { FakeCommissionSettingRepository } from '../fakes/fakeCommissionSettingRepository.js';
import { CommissionResolver } from '../../src/application/features/operatingBalance/common/commissionResolver.js';
import { OperatingBalanceLedger } from '../../src/application/features/operatingBalance/common/operatingBalanceLedger.js';
import { ListAvailableBookingsQuery } from '../../src/application/features/goalkeeperRequests/queries/listAvailableBookings/listAvailableBookingsQuery.js';
import { ListGoalkeeperAgendaQuery } from '../../src/application/features/goalkeeperRequests/queries/listGoalkeeperAgenda/listGoalkeeperAgendaQuery.js';
import { ListGoalkeeperAgendaQueryHandler } from '../../src/application/features/goalkeeperRequests/queries/listGoalkeeperAgenda/listGoalkeeperAgendaQueryHandler.js';
import { GetGoalkeeperMonthStatsQuery } from '../../src/application/features/goalkeepers/queries/getGoalkeeperMonthStats/getGoalkeeperMonthStatsQuery.js';
import { GetGoalkeeperMonthStatsQueryHandler } from '../../src/application/features/goalkeepers/queries/getGoalkeeperMonthStats/getGoalkeeperMonthStatsQueryHandler.js';
import { AcceptBookingCommand } from '../../src/application/features/goalkeeperRequests/commands/acceptBooking/acceptBookingCommand.js';
import { DismissBookingCommand } from '../../src/application/features/goalkeeperRequests/commands/dismissBooking/dismissBookingCommand.js';
import { DismissBookingCommandHandler } from '../../src/application/features/goalkeeperRequests/commands/dismissBooking/dismissBookingCommandHandler.js';
import { AcceptBookingCommandHandler } from '../../src/application/features/goalkeeperRequests/commands/acceptBooking/acceptBookingCommandHandler.js';
import { FakeBookingAcceptanceStore } from '../fakes/fakeBookingAcceptanceStore.js';
import { FakeAcceptanceAuditLogger } from '../fakes/fakeAcceptanceAuditLogger.js';
import { ListAvailableBookingsQueryHandler } from '../../src/application/features/goalkeeperRequests/queries/listAvailableBookings/listAvailableBookingsQueryHandler.js';
import { RecordOperatingBalanceAdjustmentCommand } from '../../src/application/features/operatingBalance/commands/recordOperatingBalanceAdjustment/recordOperatingBalanceAdjustmentCommand.js';
import { RecordOperatingBalanceAdjustmentCommandHandler } from '../../src/application/features/operatingBalance/commands/recordOperatingBalanceAdjustment/recordOperatingBalanceAdjustmentCommandHandler.js';
import { ApplyGatewayEventCommand } from '../../src/application/features/payments/commands/applyGatewayEvent/applyGatewayEventCommand.js';
import { ApplyGatewayEventCommandHandler } from '../../src/application/features/payments/commands/applyGatewayEvent/applyGatewayEventCommandHandler.js';
import { DepositReconcileJob } from '../../src/application/features/deposits/jobs/depositReconcileJob.js';
import { ListDepositsQuery } from '../../src/application/features/deposits/queries/listDeposits/listDepositsQuery.js';
import { ListDepositsQueryHandler } from '../../src/application/features/deposits/queries/listDeposits/listDepositsQueryHandler.js';
import { GetDepositQuery } from '../../src/application/features/deposits/queries/getDeposit/getDepositQuery.js';
import { GetDepositQueryHandler } from '../../src/application/features/deposits/queries/getDeposit/getDepositQueryHandler.js';
import { GetDepositByReferenceQuery } from '../../src/application/features/deposits/queries/getDepositByReference/getDepositByReferenceQuery.js';
import { GetDepositByReferenceQueryHandler } from '../../src/application/features/deposits/queries/getDepositByReference/getDepositByReferenceQueryHandler.js';
import { SetGatewaySettingsCommand } from '../../src/application/features/payments/commands/setGatewaySettings/setGatewaySettingsCommand.js';
import { SetGatewaySettingsCommandHandler } from '../../src/application/features/payments/commands/setGatewaySettings/setGatewaySettingsCommandHandler.js';
import { GetGatewaySettingsQuery } from '../../src/application/features/payments/queries/getGatewaySettings/getGatewaySettingsQuery.js';
import { GetGatewaySettingsQueryHandler } from '../../src/application/features/payments/queries/getGatewaySettings/getGatewaySettingsQueryHandler.js';
import type { PaymentReturnSettings } from '../../src/controllers/paymentReturnController.js';
import { FakeTaxSettingsRepository } from '../fakes/fakeTaxSettingsRepository.js';
import { createVatRateResolver } from '../../src/application/features/operatingBalance/common/vatRateResolver.js';
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
import { RetryDocumentCommand } from '../../src/application/features/invoicing/commands/retryDocument/retryDocumentCommand.js';
import { RetryDocumentCommandHandler } from '../../src/application/features/invoicing/commands/retryDocument/retryDocumentCommandHandler.js';
import { GetDepositOptionsQuery } from '../../src/application/features/deposits/queries/getDepositOptions/getDepositOptionsQuery.js';
import { GetDepositOptionsQueryHandler } from '../../src/application/features/deposits/queries/getDepositOptions/getDepositOptionsQueryHandler.js';
import { StartDepositCommand } from '../../src/application/features/deposits/commands/startDeposit/startDepositCommand.js';
import { StartDepositCommandHandler } from '../../src/application/features/deposits/commands/startDeposit/startDepositCommandHandler.js';
import { AcceptCurrentTermsCommand } from '../../src/application/features/profile/commands/acceptCurrentTerms/acceptCurrentTermsCommand.js';
import { AcceptCurrentTermsCommandHandler } from '../../src/application/features/profile/commands/acceptCurrentTerms/acceptCurrentTermsCommandHandler.js';
import { FakePaymentGateway, FakePaymentGatewayRegistry } from '../fakes/fakePaymentGateway.js';
import { FakePaymentSecrets } from '../fakes/fakePaymentSecrets.js';
import { FakePaymentGatewaySettingsRepository } from '../fakes/fakePaymentGatewaySettingsRepository.js';
import { FakeDepositRepository } from '../fakes/fakeDepositRepository.js';
import { FakeDepositStore } from '../fakes/fakeDepositStore.js';
import { GetGoalkeeperOperatingBalanceQuery } from '../../src/application/features/operatingBalance/queries/getGoalkeeperOperatingBalance/getGoalkeeperOperatingBalanceQuery.js';
import { GetGoalkeeperOperatingBalanceQueryHandler } from '../../src/application/features/operatingBalance/queries/getGoalkeeperOperatingBalance/getGoalkeeperOperatingBalanceQueryHandler.js';
import { ListBalanceMovementsQuery } from '../../src/application/features/operatingBalance/queries/listBalanceMovements/listBalanceMovementsQuery.js';
import { ListBalanceMovementsQueryHandler } from '../../src/application/features/operatingBalance/queries/listBalanceMovements/listBalanceMovementsQueryHandler.js';
import { FakeQuoteConfirmationStore } from '../fakes/fakeQuoteConfirmationStore.js';
import { FakeBookingAuditLogger } from '../fakes/fakeBookingAuditLogger.js';
import { ConfirmBookingCommand } from '../../src/application/features/goalkeeperRequests/commands/confirmBooking/confirmBookingCommand.js';
import { ListClientRequestsQuery } from '../../src/application/features/goalkeeperRequests/queries/listClientRequests/listClientRequestsQuery.js';
import { ListClientRequestsQueryHandler } from '../../src/application/features/goalkeeperRequests/queries/listClientRequests/listClientRequestsQueryHandler.js';
import { ConfirmBookingCommandHandler } from '../../src/application/features/goalkeeperRequests/commands/confirmBooking/confirmBookingCommandHandler.js';
import { GetZonesByMarketQuery } from '../../src/application/features/zones/queries/getZonesByMarket/getZonesByMarketQuery.js';
import { GetZonesByMarketQueryHandler } from '../../src/application/features/zones/queries/getZonesByMarket/getZonesByMarketQueryHandler.js';
import { ListEnabledMarketsQuery } from '../../src/application/features/markets/queries/listEnabledMarkets/listEnabledMarketsQuery.js';
import { ListEnabledMarketsQueryHandler } from '../../src/application/features/markets/queries/listEnabledMarkets/listEnabledMarketsQueryHandler.js';
import { GetBookingConfigQuery } from '../../src/application/features/goalkeeperRequests/queries/getBookingConfig/getBookingConfigQuery.js';
import { GetBookingConfigQueryHandler } from '../../src/application/features/goalkeeperRequests/queries/getBookingConfig/getBookingConfigQueryHandler.js';
import { GetServiceQuoteQuery } from '../../src/application/features/goalkeeperRequests/queries/getServiceQuote/getServiceQuoteQuery.js';
import { GetServiceQuoteQueryHandler } from '../../src/application/features/goalkeeperRequests/queries/getServiceQuote/getServiceQuoteQueryHandler.js';
import { City } from '../../src/domain/locations/city.js';
import { Region } from '../../src/domain/locations/region.js';
import { Zone } from '../../src/domain/zones/zone.js';
import { FakeCityRepository } from '../fakes/fakeCityRepository.js';
import { FakeMarketRepository, testMarket } from '../fakes/fakeMarketRepository.js';
import { FakeRegionRepository } from '../fakes/fakeRegionRepository.js';
import { FakeZoneRepository } from '../fakes/fakeZoneRepository.js';
import { FixedClock } from '../fakes/fakeClock.js';
import { FakeRentalRateRepository } from '../fakes/fakeRentalRateRepository.js';
import { FakeMatchSurfaceRepository } from '../fakes/fakeMatchSurfaceRepository.js';
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
import { SaveBillingSectionCommand } from '../../src/application/features/goalkeepers/commands/saveBillingSection/saveBillingSectionCommand.js';
import { ChangeGoalkeeperMarketCommand } from '../../src/application/features/goalkeepers/commands/changeGoalkeeperMarket/changeGoalkeeperMarketCommand.js';
import { ChangeGoalkeeperMarketCommandHandler } from '../../src/application/features/goalkeepers/commands/changeGoalkeeperMarket/changeGoalkeeperMarketCommandHandler.js';
import { FakeGoalkeeperMarketChangeStore } from '../fakes/fakeGoalkeeperMarketChangeStore.js';
import { SaveBillingSectionCommandHandler } from '../../src/application/features/goalkeepers/commands/saveBillingSection/saveBillingSectionCommandHandler.js';
import { UpdateGoalkeeperBillingCommand } from '../../src/application/features/goalkeepers/commands/updateGoalkeeperBilling/updateGoalkeeperBillingCommand.js';
import { UpdateGoalkeeperBillingCommandHandler } from '../../src/application/features/goalkeepers/commands/updateGoalkeeperBilling/updateGoalkeeperBillingCommandHandler.js';
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
import { DeleteNotificationCommand } from '../../src/application/features/notifications/commands/deleteNotification/deleteNotificationCommand.js';
import { DeleteNotificationCommandHandler } from '../../src/application/features/notifications/commands/deleteNotification/deleteNotificationCommandHandler.js';
import { DeleteAllNotificationsCommand } from '../../src/application/features/notifications/commands/deleteAllNotifications/deleteAllNotificationsCommand.js';
import { DeleteAllNotificationsCommandHandler } from '../../src/application/features/notifications/commands/deleteAllNotifications/deleteAllNotificationsCommandHandler.js';
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
import { CancelBookingsByAdminCommand } from '../../src/application/features/bookingLifecycle/commands/cancelBookingsByAdmin/cancelBookingsByAdminCommand.js';
import { CancelBookingsByAdminCommandHandler } from '../../src/application/features/bookingLifecycle/commands/cancelBookingsByAdmin/cancelBookingsByAdminCommandHandler.js';
import { CancelBookingsByClientCommandHandler } from '../../src/application/features/bookingLifecycle/commands/cancelBookingsByClient/cancelBookingsByClientCommandHandler.js';
import { NotifyBookingOffersHandler, OFFER_EVENT_TYPES } from '../../src/application/features/notifications/handlers/notifyBookingOffersHandler.js';
import { OFFER_WITHDRAWAL_EVENT_TYPES, OfferWithdrawalHandler } from '../../src/application/features/notifications/handlers/offerWithdrawalHandler.js';
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
  /** Admin spec 030: background checks and the history of vetting decisions. */
  backgroundCheckRepository: FakeBackgroundCheckRepository;
  vettingLogRepository: FakeVettingLogRepository;
  unverifiedDiscountRepository: FakeUnverifiedDiscountRepository;
  cityRepository: FakeCityRepository;
  regionRepository: FakeRegionRepository;
  marketRepository: FakeMarketRepository;
  zoneRepository: FakeZoneRepository;
  /** What points at reference data, set per test (admin spec 003). */
  referenceUsage: FakeReferenceUsage;
  marketUsage: FakeMarketUsage;
  futureBookings: FakeFutureBookingsProbe;
  rentalRateRepository: FakeRentalRateRepository;
  matchSurfaceRepository: FakeMatchSurfaceRepository;
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
  /** The operating balance ledger state (movements and operating balances) behind `/me/operating-balance` and `/admin/…/operating-balance`. */
  operatingBalanceStore: FakeOperatingBalanceStore;
  /** Seeded by `seedQuoteWorld`: every quote-world country has a country-level commission (Colombia 7.000 COP). */
  commissionSettingRepository: FakeCommissionSettingRepository;
  /** The real ledger over the fake store: tests seed movements through it. */
  operatingBalanceLedger: OperatingBalanceLedger;
  /** Events recorded by confirmations and acceptances (feature 013). */
  outboxStore: FakeOutboxStore;
  /** What the relay and the sweep handed to the messaging service; `failNextWith` simulates an outage. */
  eventPublisher: FakeEventPublisher;
  /** What the example consumer recorded (feature 013). */
  eventDeliveryLog: FakeEventDeliveryLog;
  /** The composition root's mediator, to send commands (e.g. the sweep) directly. */
  mediator: Mediator;
  /** Push devices registered through `/devices` (feature 014). */
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
  /** Operating balance deposits (feature 022): the gateway signs like Wompi; its transactions query answers from a queue. */
  paymentGateway: FakePaymentGateway;
  paymentSecrets: FakePaymentSecrets;
  /** Empty by default: `seed()` configures Colombia's Wompi settings. */
  paymentGatewaySettingsRepository: FakePaymentGatewaySettingsRepository;
  depositRepository: FakeDepositRepository;
  /** Admin web access (porteros-pro-admin spec 001). */
  staffMemberRepository: FakeStaffMemberRepository;
  staffRoleRepository: FakeStaffRoleRepository;
  adminSessionStore: FakeAdminSessionStore;
  adminTokenIssuer: FakeAdminTokenIssuer;
  adminAuditLog: FakeAdminAuditLog;
  /** Admin spec 008: the dashboard's areas, set by each test. */
  dashboardReader: FakeDashboardReader;
  /** Admin spec 008: the sweep's job leases. */
  jobLockStore: FakeJobLockStore;
  staffAccessResolver: StaffAccessResolver;
  /** Users blocked from the admin web (admin spec 005). */
  userBlockRepository: FakeUserBlockRepository;
  /** Feature 029: the requests to leave the platform, and what blocks each user's refund. */
  accountClosures: FakeAccountClosureRepository;
  closureBlockers: FakeClosureBlockersReader;
  /** Admin spec 009: the codes that went out (`lastCode()`), set `next` to fail a send. */
  loginCodeMailer: FakeLoginCodeMailer;
  loginCodeStore: FakeLoginCodeStore;
  /** Admin spec 009: the limits per network address. */
  loginCodeLimiter: FakeDurableRateLimiter;
  /** Admin spec 009: the code's expiry; empty = the default 2 minutes. */
  accessSettingsRepository: FakeAccessSettingsRepository;
  /** Admin spec 009: what the app's sign-in code logged. */
  loginCodeLogs: unknown[];
}

/** The only browser origin the admin routes allow in HTTP tests. */
export const TEST_ADMIN_ORIGIN = 'http://localhost:4200';

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
  const userBlockRepository = new FakeUserBlockRepository();
  const accountClosures = new FakeAccountClosureRepository();
  const closureBlockers = new FakeClosureBlockersReader();
  const refreshTokenRepository = new FakeRefreshTokenRepository();
  const googleValidator = new FakeGoogleIdTokenValidator();
  const tokenIssuer = new FakeInternalTokenIssuer();
  const countryRepository = new FakeCountryRepository();
  countryRepository.seed(new Country({ id: 'c1', name: 'Colombia', dialCode: '+57', countryCode: 'CO' }));
  const termsAcceptanceRepository = new FakeTermsAcceptanceRepository();
  const imageStorageProvider = new FakeImageStorageProvider();
  const imageRepository = new FakeImageRepository();
  const backgroundCheckRepository = new FakeBackgroundCheckRepository();
  const vettingLogRepository = new FakeVettingLogRepository();
  const unverifiedDiscountRepository = new FakeUnverifiedDiscountRepository();
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
  cityRepository.seed(new City({ id: 'city-medellin', name: 'Medellín', regionId: 'region-antioquia', daneStateCode: '05', daneCityCode: '05001' }));
  cityRepository.seed(new City({ id: 'city-bogota', name: 'Bogotá', regionId: 'region-cundinamarca', daneStateCode: '11', daneCityCode: '11001' }));
  // The markets (spec 031) reuse the old anchor ids so the HTTP suites keep their fixtures.
  const marketRepository = new FakeMarketRepository();
  marketRepository.seed(testMarket({ id: 'city-medellin', name: 'Medellín', countryId: 'country-co' }));
  marketRepository.seed(testMarket({ id: 'city-bogota', name: 'Bogotá', countryId: 'country-co' }));
  const zoneRepository = new FakeZoneRepository();
  const unverifiedDiscountResolver = new UnverifiedDiscountResolver(unverifiedDiscountRepository, zoneRepository, marketRepository);
  const zonePolygon = { type: 'Polygon' as const, coordinates: [[[0, 0]]] };
  zoneRepository.seed(
    new Zone({ id: 'zone-bello', marketId: 'city-medellin', name: 'Bello', slug: 'medellin-co-bello', geometry: zonePolygon, active: true, displayOrder: 1 }),
  );
  zoneRepository.seed(
    new Zone({
      id: 'zone-copacabana',
      marketId: 'city-medellin',
      name: 'Copacabana',
      slug: 'medellin-co-copacabana',
      geometry: zonePolygon,
      active: true,
      displayOrder: 2,
    }),
  );

  const quoteCountryRepository = new FakeCountryRepository();
  // The admin's geography (spec 003 of the admin) edits the same data the app's routes read.
  const adminCountries = new FakeAdminCountryRepository(countryRepository);
  const adminRegions = new FakeAdminRegionRepository(regionRepository);
  const adminCities = new FakeAdminCityRepository(cityRepository);
  const adminZones = new FakeAdminZoneRepository(zoneRepository);
  const referenceUsage = new FakeReferenceUsage();
  const marketUsage = new FakeMarketUsage();
  const futureBookings = new FakeFutureBookingsProbe();
  const rentalRateRepository = new FakeRentalRateRepository();
  const matchSurfaceRepository = new FakeMatchSurfaceRepository();
  const bookingSettingsRepository = new FakeBookingSettingsRepository();
  const clock = new FixedClock(QUOTE_NOW);
  const closedAccounts = new ClosedAccountsService(accountClosures, clock);
  const staffMemberRepository = new FakeStaffMemberRepository();
  const staffRoleRepository = new FakeStaffRoleRepository(staffMemberRepository);
  const adminSessionStore = new FakeAdminSessionStore();
  const adminTokenIssuer = new FakeAdminTokenIssuer();
  const adminAuditLog = new FakeAdminAuditLog();
  const staffAccessResolver = new StaffAccessResolver(adminSessionStore, staffMemberRepository, staffRoleRepository, clock);
  const operatingBalanceStore = new FakeOperatingBalanceStore(() => clock.now());
  const commissionSettingRepository = new FakeCommissionSettingRepository();
  const operatingBalanceLedger = new OperatingBalanceLedger(operatingBalanceStore, operatingBalanceStore, { newId: () => uuidv7() }, clock);
  const operatingBalanceContext = { goalkeeperProfileRepository, marketRepository, countryLookup: quoteCountryRepository };
  // VAT on top of commissions (feature 023): 0 % until a test seeds a rate.
  const taxSettingsRepository = new FakeTaxSettingsRepository();
  const vatRates = createVatRateResolver(taxSettingsRepository, { marketRepository }, { warn: () => undefined });
  const commissionResolver = new CommissionResolver(commissionSettingRepository, zoneRepository, marketRepository);
  const paymentGateway = new FakePaymentGateway();
  const paymentGatewayRegistry = new FakePaymentGatewayRegistry([paymentGateway]);
  const paymentSecrets = new FakePaymentSecrets();
  const paymentGatewaySettingsRepository = new FakePaymentGatewaySettingsRepository();
  const depositRepository = new FakeDepositRepository();
  const depositStore = new FakeDepositStore(depositRepository, operatingBalanceStore);
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
    movements: operatingBalanceStore,
    users: userRepository,
    operatingBalanceContext,
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
    operatingBalanceRepository: operatingBalanceStore,
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
    marketRepository,
    bookingSettingsRepository,
    logger: offersLogger,
    platformReminders: { maxReminders: 3, intervalMinutes: 5 },
  });
  const lifecycleStore = new FakeBookingLifecycleStore(bookingRepository, requestRepository, operatingBalanceStore, outboxStore, goalkeeperProfileRepository);
  const goalkeeperIncidentRepository = new FakeGoalkeeperIncidentRepository(lifecycleStore);
  const ratingRepository = new FakeRatingRepository(() => lifecycleStore.ratings());
  const caseRepository = new FakeCaseRepository(lifecycleStore.cases);
  const lifecycleIds = { newId: () => uuidv7() };
  const bookingExpiryJob = new BookingExpiryJob({ bookingRepository, store: lifecycleStore, relay: eventRelay, idGenerator: lifecycleIds, logger: offersLogger });
  const clientOutcomeNotices = new ClientOutcomeNoticeHandler({
    requestRepository,
    bookingRepository,
    zoneRepository,
    marketRepository,
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
    operatingBalanceContext,
    relay: eventRelay,
    idGenerator: lifecycleIds,
    logger: offersLogger,
  });
  const goalkeeperCancellationNotices = new GoalkeeperCancellationNoticeHandler({
    requestRepository,
    zoneRepository,
    marketRepository,
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
        marketRepository,
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
        marketRepository,
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
        marketRepository,
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
        marketRepository,
        notifications: notificationRepository,
        pushNotifier,
        processed: new FakeProcessedEventStore(),
        idGenerator: lifecycleIds,
        clock,
        logger: offersLogger,
      }),
    })),
    ...OFFER_EVENT_TYPES.map((type) => ({ type, handler: new NotifyBookingOffersHandler(mediator, new FakeProcessedEventStore(), clock) })),
    ...OFFER_WITHDRAWAL_EVENT_TYPES.map((type) => ({
      type,
      handler: new OfferWithdrawalHandler({
        notifications: notificationRepository,
        pushNotifier,
        processed: new FakeProcessedEventStore(),
        clock,
        logger: offersLogger,
      }),
    })),
  ]);
  seedQuoteWorld({ countryRepository: quoteCountryRepository, zoneRepository, marketRepository, rentalRateRepository, bookingSettingsRepository, commissionSettingRepository });

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
  // Sign-in codes (admin spec 009): six digits counting up from 100001, so each test knows them.
  const loginCodeMailer = new FakeLoginCodeMailer();
  const loginCodeStore = new FakeLoginCodeStore();
  const loginCodeLimiter = new FakeDurableRateLimiter();
  const accessSettingsRepository = new FakeAccessSettingsRepository();
  const loginCodeLogs: unknown[] = [];
  let nextLoginCode = 100_000;
  registerHandlers(
    mediator,
    loginCodeHandlerRegistrations({
      loginCodes: {
        codes: loginCodeStore,
        mailer: loginCodeMailer,
        hasher: new HmacLoginCodeHasher(() => TEST_SYSTEM_ENV.JWT_SIGNING_KEY),
        generator: { next: () => String(++nextLoginCode) },
        limiter: loginCodeLimiter,
        settings: accessSettingsRepository,
        ids: { newId: () => uuidv7() },
        clock,
      },
      appLog: { logEmailCodeEvent: (entry) => loginCodeLogs.push(entry) },
      accessSettings: accessSettingsRepository,
      users: userRepository,
      admin: {
        members: staffMemberRepository,
        sessions: adminSessionStore,
        tokens: adminTokenIssuer,
        ids: { newId: () => uuidv7() },
        clock,
        securityLog: new FakeAdminSecurityLog(),
        // The floor (research §7) is unit-tested; HTTP tests never wait for it.
        timer: { stopwatch: () => () => 0, sleep: async () => undefined },
        minResponseMs: 800,
      },
      appSession: {
        refreshTokenRepository,
        tokenIssuer,
        goalkeeperProfileRepository,
        idGenerator,
        refreshTokenLifetimeMs: 30 * 24 * 60 * 60 * 1000,
        blockedUsers: userBlockRepository,
        closedAccounts,
      },
    }),
  );

  registerHandlers(
    mediator,
    staffHandlerRegistrations({
      google: googleValidator,
      users: userRepository,
      members: staffMemberRepository,
      roles: staffRoleRepository,
      sessions: adminSessionStore,
      tokens: adminTokenIssuer,
      ids: { newId: () => uuidv7() },
      clock,
      securityLog: new FakeAdminSecurityLog(),
      accessResolver: staffAccessResolver,
      auditLog: adminAuditLog,
      places: { markets: marketRepository, countries: quoteCountryRepository },
    }),
  );
  registerHandlers(
    mediator,
    geographyHandlerRegistrations({
      countries: adminCountries,
      regions: adminRegions,
      cities: adminCities,
      markets: marketRepository,
      zones: adminZones,
      usage: referenceUsage,
      marketUsage,
      futureBookings,
      bookingSettings: bookingSettingsRepository,
      rentalRates: rentalRateRepository,
      commissions: commissionSettingRepository,
      taxSettings: taxSettingsRepository,
      gatewaySettings: paymentGatewaySettingsRepository,
      invoicingSettings: invoicingSettingsRepository,
      documentTypes: new FakeAdminDocumentTypeRepository(documentTypeRepository),
      surfaces: new FakeAdminMatchSurfaceRepository(matchSurfaceRepository),
      ids: { newId: () => uuidv7() },
      clock,
    }),
  );
  registerHandlers(
    mediator,
    pricingHandlerRegistrations({
      countryLookup: quoteCountryRepository,
      rentalRateRepository,
      bookingSettingsRepository,
      commissionResolver,
      // The quote reads its own country store; prices must see the same currencies it does.
      countries: new FakeAdminCountryRepository(quoteCountryRepository),
      markets: marketRepository,
      zones: adminZones,
      rentalRates: new FakeRentalRateAdmin(rentalRateRepository),
      commissions: new FakeCommissionAdmin(commissionSettingRepository),
      bookingSettings: new FakeBookingSettingsAdmin(bookingSettingsRepository),
      discounts: unverifiedDiscountRepository,
      taxSettings: taxSettingsRepository,
      ids: { newId: () => uuidv7() },
      clock,
    }),
  );
  const goalkeeperAdminReader = new FakeGoalkeeperAdminReader({ profiles: goalkeeperProfileRepository, operatingBalances: operatingBalanceStore, lifecycle: lifecycleStore, bookings: bookingRepository });
  const userAdminReader = new FakeUserAdminReader({
    users: userRepository,
    profiles: goalkeeperProfileRepository,
    blocks: userBlockRepository,
    terms: termsAcceptanceRepository,
    devices: deviceRepository,
    requests: requestRepository,
    bookings: bookingRepository,
  });
  registerHandlers(
    mediator,
    accountClosureHandlerRegistrations({
      closures: accountClosures,
      userSearch: userAdminReader,
      users: userRepository,
      profiles: goalkeeperProfileRepository,
      balanceContext: operatingBalanceContext,
      balances: operatingBalanceStore,
      movements: operatingBalanceStore,
      ledger: operatingBalanceLedger,
      blockers: closureBlockers,
      notices: { notifications: notificationRepository, pushNotifier, idGenerator, clock },
      devices: deviceRepository,
      suggestDepositAmount: async () => 40000,
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
      closures: accountClosures,
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
      monthStats: (goalkeeperId) => mediator.send(new AdminMonthStatsQuery(goalkeeperId)),
      clock,
      registrations: goalkeeperRegistrationRepository,
      images: imageRepository,
      documentWriter: new FakeGoalkeeperDocumentWriter(goalkeeperProfileRepository, goalkeeperRegistrationRepository),
    }),
  );
  const vettingNotifier = new VettingNotifier({
    notifications: notificationRepository,
    pushNotifier,
    idGenerator,
    clock,
    logger: { info: () => undefined, warn: () => undefined },
  });
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
      reader: new FakeRequestAdminReader({
        markets: marketRepository,
        requests: requestRepository,
        bookings: bookingRepository,
        operatingBalance: operatingBalanceStore,
        lifecycle: lifecycleStore,
        notifications: notificationRepository,
      }),
      users: userRepository,
      markets: marketRepository,
      zones: zoneRepository,
      staff: staffMemberRepository,
      clock,
      cases: caseRepository,
      ratings: ratingRepository,
      requests: requestRepository,
      send: (query) => mediator.send(query),
      notificationReader: new FakeNotificationAdminReader(notificationRepository, deviceRepository),
      ratingReader: new FakeRatingAdminReader(lifecycleStore),
    }),
  );
  // Finance (admin spec 007): the admin's reads of money and "Conciliar ahora".
  registerHandlers(mediator, [
    ...financeHandlerRegistrations({
      depositReader: new FakeDepositAdminReader(depositRepository),
      operatingBalanceReader: new FakeOperatingBalanceAdminReader({ operatingBalances: operatingBalanceStore, profiles: goalkeeperProfileRepository, markets: marketRepository }),
      markets: marketRepository,
      documentReader: new FakeInvoicingDocumentAdminReader(invoicingDocumentRepository),
      documents: invoicingDocumentRepository,
      clock,
      issuingEnabled: true,
      users: userRepository,
      countries: quoteCountryRepository,
    }),
    {
      requestType: ReconcileDepositCommand,
      handler: new ReconcileDepositCommandHandler({
        operatingBalanceContext,
        store: depositStore,
        notices: { notifications: notificationRepository, pushNotifier, idGenerator: lifecycleIds, clock },
        logger: offersLogger,
        depositRepository,
        gateways: paymentGatewayRegistry,
        secrets: paymentSecrets,
        countryLookup: quoteCountryRepository,
        clock,
      }),
    },
  ]);
  // As in the composition root: one list of jobs, run by the sweep and shown by Sistema (admin spec 008).
  const jobLockStore = new FakeJobLockStore();
  const scheduledJobs: IScheduledJob[] = [
    cancelAllJob,
    bookingExpiryJob,
    new BookingCompletionJob({ bookingRepository, store: lifecycleStore, relay: eventRelay, idGenerator: lifecycleIds, logger: offersLogger }),
    new NoShowWatchJob({
      operatingBalanceContext,
      bookingSettingsRepository,
      logger: offersLogger,
      bookingRepository,
      requestRepository,
      store: lifecycleStore,
      relay: eventRelay,
      idGenerator: lifecycleIds,
      clock,
      graceResolver: () => createNoShowGraceResolver({ marketRepository, bookingSettingsRepository, logger: offersLogger }),
    }),
    new OfferRemindersJob({ bookingRepository, eligibility: offerEligibility, sender: offerSender, logger: offersLogger, roundCap: 2000 }),
    new ContactsRevealJob({
      requestRepository,
      bookingRepository,
      userRepository,
      zoneRepository,
      marketRepository,
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
      marketRepository,
      notifications: notificationRepository,
      pushNotifier,
      idGenerator: lifecycleIds,
      clock,
      logger: offersLogger,
      windowResolver: () => createCheckInWindowResolver({ marketRepository, bookingSettingsRepository, logger: offersLogger }),
    }),
    new DepositReconcileJob({
      operatingBalanceContext,
      store: depositStore,
      notices: { notifications: notificationRepository, pushNotifier, idGenerator: lifecycleIds, clock },
      logger: offersLogger,
      depositRepository,
      gateways: paymentGatewayRegistry,
      secrets: paymentSecrets,
      countryLookup: quoteCountryRepository,
    }),
    new InvoicingIssuerJob({ ...invoicingDeps, scanner: new FakeBillableMovementScanner(operatingBalanceStore, invoicingDocumentRepository), cap: 100 }),
  ];
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
        jobs: scheduledJobs,
        jobLocks: jobLockStore,
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
        undefined,
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
        undefined,
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
      handler: new GetCitiesQueryHandler(cityRepository, regionRepository),
    },
    { requestType: GetZonesByMarketQuery, handler: new GetZonesByMarketQueryHandler(marketRepository, zoneRepository) },
    { requestType: ListEnabledMarketsQuery, handler: new ListEnabledMarketsQueryHandler(marketRepository) },
    {
      requestType: GetBookingConfigQuery,
      handler: new GetBookingConfigQueryHandler(
        zoneRepository,
        marketRepository,
        quoteCountryRepository,
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
        quoteCountryRepository,
        rentalRateRepository,
        bookingSettingsRepository,
        commissionResolver,
        clock,
        matchSurfaceRepository,
      ),
    },
    {
      requestType: IssueServiceQuoteCommand,
      handler: new IssueServiceQuoteCommandHandler(mediator, quoteRepository, uuidGenerator, clock, unverifiedDiscountResolver),
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
      handler: new GetGoalkeeperOperatingBalanceQueryHandler(operatingBalanceContext, operatingBalanceStore, commissionResolver, clock, vatRates),
    },
    {
      requestType: GetDepositOptionsQuery,
      handler: new GetDepositOptionsQueryHandler(operatingBalanceContext, paymentGatewaySettingsRepository, termsAcceptanceRepository, { termsVersion: '1.0' }),
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
        idGenerator: { newId: () => uuidv7() },
        clock,
        logger: offersLogger,
        settings: { termsVersion: '1.0', publicBaseUrl: TEST_PAYMENTS_BASE_URL },
      }),
    },
    {
      requestType: ApplyGatewayEventCommand,
      handler: new ApplyGatewayEventCommandHandler({
        operatingBalanceContext,
        store: depositStore,
        notices: { notifications: notificationRepository, pushNotifier, idGenerator: lifecycleIds, clock },
        logger: offersLogger,
        gateways: paymentGatewayRegistry,
        secrets: paymentSecrets,
        depositRepository,
        countryLookup: quoteCountryRepository,
        clock,
      }),
    },
    { requestType: ListDepositsQuery, handler: new ListDepositsQueryHandler(goalkeeperProfileRepository, depositRepository) },
    { requestType: GetDepositQuery, handler: new GetDepositQueryHandler(depositRepository) },
    { requestType: GetDepositByReferenceQuery, handler: new GetDepositByReferenceQueryHandler(depositRepository) },
    {
      requestType: SetGatewaySettingsCommand,
      handler: new SetGatewaySettingsCommandHandler(quoteCountryRepository, paymentGatewaySettingsRepository, paymentSecrets, clock, offersLogger, marketRepository),
    },
    { requestType: GetGatewaySettingsQuery, handler: new GetGatewaySettingsQueryHandler(paymentGatewaySettingsRepository, paymentSecrets, quoteCountryRepository) },
    {
      requestType: ListGatewaySettingsQuery,
      handler: new ListGatewaySettingsQueryHandler({ settingsRepository: paymentGatewaySettingsRepository, secrets: paymentSecrets, countryLookup: quoteCountryRepository, markets: marketRepository }),
    },
    { requestType: DeleteMarketGatewayOverrideCommand, handler: new DeleteMarketGatewayOverrideCommandHandler(paymentGatewaySettingsRepository) },
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
      requestType: RecordOperatingBalanceAdjustmentCommand,
      handler: new RecordOperatingBalanceAdjustmentCommandHandler(operatingBalanceContext, operatingBalanceLedger, operatingBalanceStore, {
        notifications: notificationRepository,
        pushNotifier,
        idGenerator: lifecycleIds,
        clock,
      }),
    },
    {
      requestType: DismissBookingCommand,
      handler: new DismissBookingCommandHandler(goalkeeperProfileRepository, bookingRepository),
    },
    {
      requestType: AcceptBookingCommand,
      handler: new AcceptBookingCommandHandler({
        windowResolver: () => createCheckInWindowResolver({ marketRepository, bookingSettingsRepository, logger: offersLogger }),
        operatingBalanceContext,
        operatingBalanceRepository: operatingBalanceStore,
        bookingRepository,
        requestRepository,
        zoneRepository,
        marketRepository,
        userRepository,
        store: new FakeBookingAcceptanceStore(bookingRepository, operatingBalanceStore, outboxStore),
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
        operatingBalanceRepository: operatingBalanceStore,
        commissionResolver,
        bookingRepository,
        requestRepository: requestRepository,
        zoneRepository,
        marketRepository,
        clock,
      }),
    },
    {
      requestType: ListGoalkeeperAgendaQuery,
      handler: new ListGoalkeeperAgendaQueryHandler({
        windowResolver: () => createCheckInWindowResolver({ marketRepository, bookingSettingsRepository, logger: offersLogger }),
        goalkeeperProfileRepository,
        bookingRepository,
        requestRepository,
        zoneRepository,
        marketRepository,
        userRepository,
        clock,
      }),
    },
    {
      requestType: GetGoalkeeperMonthStatsQuery,
      handler: new GetGoalkeeperMonthStatsQueryHandler({ context: operatingBalanceContext, bookingRepository, clock }),
    },
    {
      requestType: ListBalanceMovementsQuery,
      handler: new ListBalanceMovementsQueryHandler(goalkeeperProfileRepository, operatingBalanceStore, operatingBalanceStore),
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
        countries: quoteCountryRepository,
        store: new FakeGoalkeeperMarketChangeStore({ profiles: goalkeeperProfileRepository, bookings: bookingRepository, balances: operatingBalanceStore, deposits: depositRepository, closures: accountClosures }),
        clock,
      }),
    },
    {
      requestType: CancelGoalkeeperRegistrationCommand,
      handler: new CancelGoalkeeperRegistrationCommandHandler(mediator, goalkeeperRegistrationRepository),
    },
    {
      requestType: SetOffersAvailabilityCommand,
      handler: new SetOffersAvailabilityCommandHandler({ goalkeeperProfileRepository, eligibility: offerEligibility, sender: offerSender, clock, logger: offersLogger, blocks: userBlockRepository }),
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
        idGenerator: lifecycleIds,
        clock,
        audit: bookingAuditLogger,
        logger: offersLogger,
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
        idGenerator: lifecycleIds,
        clock,
        audit: bookingAuditLogger,
        logger: offersLogger,
      }),
    },
    {
      requestType: ListGoalkeeperWithdrawalsQuery,
      handler: new ListGoalkeeperWithdrawalsQueryHandler({
        goalkeeperProfileRepository,
        incidents: goalkeeperIncidentRepository,
        clock,
        adminDetails: new WithdrawalAdminDetails({ bookings: bookingRepository, zones: zoneRepository, markets: marketRepository, movements: operatingBalanceStore }),
      }),
    },
    {
      requestType: ReverseWithdrawalPenaltyCommand,
      handler: new ReverseWithdrawalPenaltyCommandHandler({ operatingBalanceContext, store: lifecycleStore, idGenerator: lifecycleIds, clock, audit: bookingAuditLogger, logger: offersLogger }),
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
        windowResolver: () => createCheckInWindowResolver({ marketRepository, bookingSettingsRepository, logger: offersLogger }),
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
        operatingBalanceContext,
        bookingSettingsRepository,
        logger: offersLogger,
        bookingRepository,
        store: lifecycleStore,
        relay: eventRelay,
        idGenerator: lifecycleIds,
        clock,
        audit: bookingAuditLogger,
        reputation: reputationVerifier,
      }),
    },
    {
      requestType: ListPendingRatingsQuery,
      handler: new ListPendingRatingsQueryHandler({ bookingRepository, ratingRepository: ratingRepository, requestRepository, zoneRepository, marketRepository, userRepository, clock }),
    },
    { requestType: ListCasesQuery, handler: new ListCasesQueryHandler(caseRepository) },
    { requestType: GetCaseQuery, handler: new GetCaseQueryHandler(caseRepository, ratingRepository) },
    { requestType: ResolveCaseCommand, handler: new ResolveCaseCommandHandler(caseRepository, ratingRepository, clock, bookingAuditLogger) },
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
  // Dashboard and system (admin spec 008).
  const dashboardReader = new FakeDashboardReader();
  registerHandlers(
    mediator,
    dashboardSystemHandlerRegistrations({
      dashboardReader,
      countries: adminCountries,
      markets: marketRepository,
      clock,
      logger: offersLogger,
      outbox: outboxStore,
      jobs: scheduledJobs,
      jobLocks: jobLockStore,
      checkHealth: async () => health,
      stuckAfterMinutes: 5,
      parameters: {
        parameters: () => readSystemParameters(TEST_SYSTEM_ENV),
        gatewaySettings: paymentGatewaySettingsRepository,
        invoicingSettings: invoicingSettingsRepository,
        paymentSecrets,
        invoicingSecrets,
      },
    }),
  );

  const health: HealthReportResponse = { status: 'Healthy', checks: [{ name: 'mongodb', status: 'Healthy' }] };

  const dependencies: AppDependencies = {
    mediator,
    verifyAccessToken: (token) => tokenIssuer.verifyAccessToken(token),
    checkHealth: async () => health,
    publisher: mediator,
    verifyInternalCaller: async (token) => token === TEST_INTERNAL_TOKEN,
    paymentReturn: { appOpenUrl: '', androidPackage: '', androidCertSha256: [], iosAppId: '', ...options.paymentReturn },
    admin: {
      verifyAccessToken: (token) => adminTokenIssuer.verifyAccessToken(token),
      accessResolver: staffAccessResolver,
      auditLog: adminAuditLog,
      scope: { markets: marketRepository, countries: quoteCountryRepository },
      allowedOrigins: [TEST_ADMIN_ORIGIN],
      sessionCookieSecure: true,
      newId: () => uuidv7(),
      now: () => clock.now(),
    },
  };

  return {
    referenceUsage,
    marketUsage,
    futureBookings,
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
    backgroundCheckRepository,
    vettingLogRepository,
    unverifiedDiscountRepository,
    cityRepository,
    regionRepository,
    marketRepository,
    zoneRepository,
    rentalRateRepository,
    matchSurfaceRepository,
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
    operatingBalanceStore,
    commissionSettingRepository,
    operatingBalanceLedger,
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
    depositRepository,
    staffMemberRepository,
    staffRoleRepository,
    adminSessionStore,
    adminTokenIssuer,
    adminAuditLog,
    dashboardReader,
    jobLockStore,
    staffAccessResolver,
    userBlockRepository,
    accountClosures,
    closureBlockers,
    loginCodeMailer,
    loginCodeStore,
    loginCodeLimiter,
    accessSettingsRepository,
    loginCodeLogs,
  };
}
