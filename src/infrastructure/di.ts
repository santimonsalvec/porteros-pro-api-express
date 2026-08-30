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
import { StoreImageCommand } from '../application/features/images/commands/storeImage/storeImageCommand.js';
import { StoreImageCommandHandler } from '../application/features/images/commands/storeImage/storeImageCommandHandler.js';
import { ResolveImageQuery } from '../application/features/images/queries/resolveImage/resolveImageQuery.js';
import { ResolveImageQueryHandler } from '../application/features/images/queries/resolveImage/resolveImageQueryHandler.js';
import { DeleteImageCommand } from '../application/features/images/commands/deleteImage/deleteImageCommand.js';
import { DeleteImageCommandHandler } from '../application/features/images/commands/deleteImage/deleteImageCommandHandler.js';
import type { AppDependencies } from '../appDependencies.js';
import { config } from './config.js';
import { MongoConnectionProvider } from './persistence/mongo/mongoConnectionProvider.js';
import { UserRepository } from './persistence/mongo/userRepository.js';
import { RefreshTokenRepository } from './persistence/mongo/refreshTokenRepository.js';
import { TermsAcceptanceRepository } from './persistence/mongo/termsAcceptanceRepository.js';
import { CountryRepository } from './persistence/mongo/countryRepository.js';
import { ImageRepository } from './persistence/mongo/imageRepository.js';
import { GoogleIdTokenValidator } from './auth/googleIdTokenValidator.js';
import { JwtInternalTokenIssuer } from './auth/jwtInternalTokenIssuer.js';
import { GoogleSsoProviderCatalog } from './auth/googleSsoProviderCatalog.js';
import { DEFAULT_GOOGLE_SCOPES } from './auth/googleSsoOptions.js';
import { PinoAuditLogger } from './observability/pinoAuditLogger.js';
import { UuidIdGenerator } from './uuidIdGenerator.js';
import { MongoHealthCheck } from './healthChecks/mongoHealthCheck.js';
import { CloudinaryImageStorageProvider } from './images/cloudinaryImageStorageProvider.js';

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
      requestType: StoreImageCommand,
      handler: new StoreImageCommandHandler(imageStorageProvider, imageRepository, idGenerator),
    },
    { requestType: ResolveImageQuery, handler: new ResolveImageQueryHandler(imageRepository) },
    {
      requestType: DeleteImageCommand,
      handler: new DeleteImageCommandHandler(imageStorageProvider, imageRepository),
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
