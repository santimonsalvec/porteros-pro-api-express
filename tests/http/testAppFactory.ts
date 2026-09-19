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
import { GetCitiesQuery } from '../../src/application/features/locations/queries/getCities/getCitiesQuery.js';
import { GetCitiesQueryHandler } from '../../src/application/features/locations/queries/getCities/getCitiesQueryHandler.js';
import { GetZonesByCityQuery } from '../../src/application/features/zones/queries/getZonesByCity/getZonesByCityQuery.js';
import { GetZonesByCityQueryHandler } from '../../src/application/features/zones/queries/getZonesByCity/getZonesByCityQueryHandler.js';
import { City } from '../../src/domain/locations/city.js';
import { Region } from '../../src/domain/locations/region.js';
import { Zone } from '../../src/domain/zones/zone.js';
import { FakeCityRepository } from '../fakes/fakeCityRepository.js';
import { FakeRegionRepository } from '../fakes/fakeRegionRepository.js';
import { FakeZoneRepository } from '../fakes/fakeZoneRepository.js';
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
  goalkeeperRegistrationRepository: FakeGoalkeeperRegistrationRepository;
  documentTypeRepository: FakeDocumentTypeRepository;
  goalkeeperProfileRepository: FakeGoalkeeperProfileRepository;
  cityRepository: FakeCityRepository;
  regionRepository: FakeRegionRepository;
  zoneRepository: FakeZoneRepository;
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
    goalkeeperRegistrationRepository,
    documentTypeRepository,
    goalkeeperProfileRepository,
    cityRepository,
    regionRepository,
    zoneRepository,
    health,
  };
}
