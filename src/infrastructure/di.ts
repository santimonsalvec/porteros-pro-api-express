import { Mediator, registerHandlers } from '../application/common/mediator/mediator.js';
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
import { config } from './config.js';
import { MongoConnectionProvider } from './persistence/mongo/mongoConnectionProvider.js';
import { UserRepository } from './persistence/mongo/userRepository.js';
import { RefreshTokenRepository } from './persistence/mongo/refreshTokenRepository.js';
import { TermsAcceptanceRepository } from './persistence/mongo/termsAcceptanceRepository.js';
import { CountryRepository } from './persistence/mongo/countryRepository.js';
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
import { MongoQuoteConfirmationStore } from './persistence/mongo/quoteConfirmationStore.js';
import { MongoHealthCheck } from './healthChecks/mongoHealthCheck.js';
import { CloudinaryImageStorageProvider } from './images/cloudinaryImageStorageProvider.js';
import { GoalkeeperRegistrationRepository } from './persistence/mongo/goalkeeperRegistrationRepository.js';
import { DocumentTypeRepository } from './persistence/mongo/documentTypeRepository.js';
import { GoalkeeperProfileRepository } from './persistence/mongo/goalkeeperProfileRepository.js';

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
  const bookingRepository = new BookingRepository(db);
  await bookingRepository.ensureIndexes();
  const quoteConfirmationStore = new MongoQuoteConfirmationStore(() => connectionProvider.startSession(), db);

  const imageStorageProvider = new CloudinaryImageStorageProvider({
    cloudinaryUrl: config.images.cloudinaryUrl,
  });

  const googleValidator = new GoogleIdTokenValidator({
    mobile: config.google.clientIdMobile,
    'admin-web': config.google.clientIdWeb,
  });
  const tokenIssuer = new JwtInternalTokenIssuer({
    signingKey: config.jwt.signingKey,
    accessTokenLifetimeMinutes: config.jwt.accessTokenLifetimeMinutes,
    refreshTokenLifetimeDays: config.jwt.refreshTokenLifetimeDays,
  });
  const ssoCatalog = new GoogleSsoProviderCatalog({
    clientIdMobile: config.google.clientIdMobile,
    clientIdWeb: config.google.clientIdWeb,
    scopes: DEFAULT_GOOGLE_SCOPES,
  });
  const auditLogger = new PinoAuditLogger();
  const idGenerator = new UuidIdGenerator();
  const clock = new SystemClock();
  const refreshTokenLifetimeMs = config.jwt.refreshTokenLifetimeDays * 24 * 60 * 60 * 1000;
  const mongoHealthCheck = new MongoHealthCheck(db);

  const mediator = new Mediator();
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
        bookingRepository,
        quoteRepository,
        quoteConfirmationStore,
        idGenerator,
        clock,
        auditLogger,
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
  ]);

  return {
    dependencies: {
      mediator,
      verifyAccessToken: (token) => tokenIssuer.verifyAccessToken(token),
      checkHealth: () => mongoHealthCheck.check(),
    },
    close: async () => {
      await connectionProvider.close();
    },
  };
}
