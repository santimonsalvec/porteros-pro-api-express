import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import type { AppDependencies } from '../../src/appDependencies.js';
import { Mediator, registerHandlers } from '../../src/application/common/mediator/mediator.js';
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
import { StoreImageCommand } from '../../src/application/features/images/commands/storeImage/storeImageCommand.js';
import { StoreImageCommandHandler } from '../../src/application/features/images/commands/storeImage/storeImageCommandHandler.js';
import { ResolveImageQuery } from '../../src/application/features/images/queries/resolveImage/resolveImageQuery.js';
import { ResolveImageQueryHandler } from '../../src/application/features/images/queries/resolveImage/resolveImageQueryHandler.js';
import { DeleteImageCommand } from '../../src/application/features/images/commands/deleteImage/deleteImageCommand.js';
import { DeleteImageCommandHandler } from '../../src/application/features/images/commands/deleteImage/deleteImageCommandHandler.js';
import type { HealthReportResponse } from '../../src/infrastructure/healthChecks/healthReport.js';
import { FakeImageStorageProvider } from '../fakes/fakeImageStorageProvider.js';
import { FakeImageRepository } from '../fakes/fakeImageRepository.js';

export interface TestAppContext {
  app: Express;
  userRepository: FakeUserRepository;
  refreshTokenRepository: FakeRefreshTokenRepository;
  googleValidator: FakeGoogleIdTokenValidator;
  tokenIssuer: FakeInternalTokenIssuer;
  countryRepository: FakeCountryRepository;
  termsAcceptanceRepository: FakeTermsAcceptanceRepository;
  imageStorageProvider: FakeImageStorageProvider;
  imageRepository: FakeImageRepository;
  /** Mutate `.status` before a request to simulate an unhealthy dependency. */
  health: HealthReportResponse;
}

/**
 * Fake-backed composition root for HTTP-level tests — the Node equivalent of the
 * source's `WebApplicationFactory` + `ConfigureTestServices`/`RemoveAll<T>()`. Grows
 * incrementally as each user story adds its own handlers/registrations.
 */
export function buildTestApp(): TestAppContext {
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
      ),
    },
    {
      requestType: RefreshAccessTokenCommand,
      handler: new RefreshAccessTokenCommandHandler(refreshTokenRepository, userRepository, tokenIssuer, idGenerator),
    },
    {
      requestType: CompleteProfileCommand,
      handler: new CompleteProfileCommandHandler(
        userRepository,
        countryRepository,
        termsAcceptanceRepository,
        tokenIssuer,
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
      requestType: StoreImageCommand,
      handler: new StoreImageCommandHandler(imageStorageProvider, imageRepository, idGenerator),
    },
    { requestType: ResolveImageQuery, handler: new ResolveImageQueryHandler(imageRepository) },
    {
      requestType: DeleteImageCommand,
      handler: new DeleteImageCommandHandler(imageStorageProvider, imageRepository),
    },
  ]);

  const health: HealthReportResponse = { status: 'Healthy', checks: [{ name: 'mongodb', status: 'Healthy' }] };

  const dependencies: AppDependencies = {
    mediator,
    verifyAccessToken: (token) => tokenIssuer.verifyAccessToken(token),
    checkHealth: async () => health,
  };

  return {
    app: createApp(dependencies),
    userRepository,
    refreshTokenRepository,
    googleValidator,
    tokenIssuer,
    countryRepository,
    termsAcceptanceRepository,
    imageStorageProvider,
    imageRepository,
    health,
  };
}
