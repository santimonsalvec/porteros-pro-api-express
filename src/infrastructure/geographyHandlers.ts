import type { HandlerRegistration } from '../application/common/mediator/mediator.js';
import type { IClock } from '../application/common/clock.js';
import type { IIdGenerator } from '../application/features/auth/common/ports.js';
import type { IDocumentTypeRepository } from '../application/features/goalkeepers/common/ports.js';
import type {
  IAdminCityRepository,
  IAdminCountryRepository,
  IAdminDocumentTypeRepository,
  IAdminMatchSurfaceRepository,
  IAdminRegionRepository,
  IAdminZoneRepository,
  IFutureBookingsProbe,
  IReferenceUsage,
} from '../application/features/geography/common/ports.js';
import { ReadinessSummarizer, type ReadinessDependencies } from '../application/features/geography/common/readiness.js';
import { GetReadinessQuery } from '../application/features/geography/queries/getReadiness/getReadinessQuery.js';
import { GetReadinessQueryHandler } from '../application/features/geography/queries/getReadiness/getReadinessQueryHandler.js';
import { ListTimeZonesQuery } from '../application/features/geography/queries/listTimeZones/listTimeZonesQuery.js';
import { ListTimeZonesQueryHandler } from '../application/features/geography/queries/listTimeZones/listTimeZonesQueryHandler.js';
import { ListCitiesQuery } from '../application/features/geography/queries/listCities/listCitiesQuery.js';
import { ListCitiesQueryHandler } from '../application/features/geography/queries/listCities/listCitiesQueryHandler.js';
import { GetCityQuery } from '../application/features/geography/queries/getCity/getCityQuery.js';
import { GetCityQueryHandler } from '../application/features/geography/queries/getCity/getCityQueryHandler.js';
import { SaveCityCommand } from '../application/features/geography/commands/saveCity/saveCityCommand.js';
import { SaveCityCommandHandler } from '../application/features/geography/commands/saveCity/saveCityCommandHandler.js';
import { DeleteCityCommand } from '../application/features/geography/commands/deleteCity/deleteCityCommand.js';
import { DeleteCityCommandHandler } from '../application/features/geography/commands/deleteCity/deleteCityCommandHandler.js';

import { ValidateZoneGeometryQuery } from '../application/features/geography/queries/validateZoneGeometry/validateZoneGeometryQuery.js';
import { ValidateZoneGeometryQueryHandler } from '../application/features/geography/queries/validateZoneGeometry/validateZoneGeometryQueryHandler.js';
import { ListZonesQuery } from '../application/features/geography/queries/listZones/listZonesQuery.js';
import { ListZonesQueryHandler } from '../application/features/geography/queries/listZones/listZonesQueryHandler.js';
import { GetZoneQuery } from '../application/features/geography/queries/getZone/getZoneQuery.js';
import { ListZoneShapesQuery } from '../application/features/geography/queries/listZoneShapes/listZoneShapesQuery.js';
import { ListZoneShapesQueryHandler } from '../application/features/geography/queries/listZoneShapes/listZoneShapesQueryHandler.js';
import { GetZoneQueryHandler } from '../application/features/geography/queries/getZone/getZoneQueryHandler.js';
import { SaveZoneCommand } from '../application/features/geography/commands/saveZone/saveZoneCommand.js';
import { SaveZoneCommandHandler } from '../application/features/geography/commands/saveZone/saveZoneCommandHandler.js';
import { DeleteZoneCommand } from '../application/features/geography/commands/deleteZone/deleteZoneCommand.js';
import { DeleteZoneCommandHandler } from '../application/features/geography/commands/deleteZone/deleteZoneCommandHandler.js';

import { ListCountriesQuery } from '../application/features/geography/queries/listCountries/listCountriesQuery.js';
import { ListCountriesQueryHandler } from '../application/features/geography/queries/listCountries/listCountriesQueryHandler.js';
import { GetCountryQuery } from '../application/features/geography/queries/getCountry/getCountryQuery.js';
import { GetCountryQueryHandler } from '../application/features/geography/queries/getCountry/getCountryQueryHandler.js';
import { ListRegionsQuery } from '../application/features/geography/queries/listRegions/listRegionsQuery.js';
import { ListRegionsQueryHandler } from '../application/features/geography/queries/listRegions/listRegionsQueryHandler.js';
import { GetRegionQuery } from '../application/features/geography/queries/getRegion/getRegionQuery.js';
import { GetRegionQueryHandler } from '../application/features/geography/queries/getRegion/getRegionQueryHandler.js';
import { SaveCountryCommand } from '../application/features/geography/commands/saveCountry/saveCountryCommand.js';
import { SaveCountryCommandHandler } from '../application/features/geography/commands/saveCountry/saveCountryCommandHandler.js';
import { SaveRegionCommand } from '../application/features/geography/commands/saveRegion/saveRegionCommand.js';
import { SaveRegionCommandHandler } from '../application/features/geography/commands/saveRegion/saveRegionCommandHandler.js';
import { DeleteRegionCommand } from '../application/features/geography/commands/deleteRegion/deleteRegionCommand.js';
import { DeleteRegionCommandHandler } from '../application/features/geography/commands/deleteRegion/deleteRegionCommandHandler.js';

import { ListDocumentTypesQuery } from '../application/features/geography/queries/listDocumentTypes/listDocumentTypesQuery.js';
import { ListDocumentTypesQueryHandler } from '../application/features/geography/queries/listDocumentTypes/listDocumentTypesQueryHandler.js';
import { GetDocumentTypeQuery } from '../application/features/geography/queries/getDocumentType/getDocumentTypeQuery.js';
import { GetDocumentTypeQueryHandler } from '../application/features/geography/queries/getDocumentType/getDocumentTypeQueryHandler.js';
import { ListMatchSurfacesQuery } from '../application/features/geography/queries/listMatchSurfaces/listMatchSurfacesQuery.js';
import { ListMatchSurfacesQueryHandler } from '../application/features/geography/queries/listMatchSurfaces/listMatchSurfacesQueryHandler.js';
import { GetMatchSurfaceQuery } from '../application/features/geography/queries/getMatchSurface/getMatchSurfaceQuery.js';
import { GetMatchSurfaceQueryHandler } from '../application/features/geography/queries/getMatchSurface/getMatchSurfaceQueryHandler.js';
import { SaveDocumentTypeCommand } from '../application/features/geography/commands/saveDocumentType/saveDocumentTypeCommand.js';
import { SaveDocumentTypeCommandHandler } from '../application/features/geography/commands/saveDocumentType/saveDocumentTypeCommandHandler.js';
import { DeleteDocumentTypeCommand } from '../application/features/geography/commands/deleteDocumentType/deleteDocumentTypeCommand.js';
import { DeleteDocumentTypeCommandHandler } from '../application/features/geography/commands/deleteDocumentType/deleteDocumentTypeCommandHandler.js';
import { SaveMatchSurfaceCommand } from '../application/features/geography/commands/saveMatchSurface/saveMatchSurfaceCommand.js';
import { SaveMatchSurfaceCommandHandler } from '../application/features/geography/commands/saveMatchSurface/saveMatchSurfaceCommandHandler.js';
import { DeleteMatchSurfaceCommand } from '../application/features/geography/commands/deleteMatchSurface/deleteMatchSurfaceCommand.js';
import { DeleteMatchSurfaceCommandHandler } from '../application/features/geography/commands/deleteMatchSurface/deleteMatchSurfaceCommandHandler.js';

/** What the geography and catalog handlers of the admin web need; grows with each user story. */
export interface GeographyHandlerDependencies extends ReadinessDependencies {
  countries: IAdminCountryRepository;
  regions: IAdminRegionRepository;
  cities: IAdminCityRepository;
  zones: IAdminZoneRepository;
  /** Read by the readiness (`getAll`) and edited by the catalog screens. */
  documentTypes: IDocumentTypeRepository & IAdminDocumentTypeRepository;
  surfaces: IAdminMatchSurfaceRepository;
  usage: IReferenceUsage;
  futureBookings: IFutureBookingsProbe;
  ids: IIdGenerator;
  clock: IClock;
}

/**
 * The admin web's geography and catalog handlers (porteros-pro-admin spec 003), shared by the
 * composition root and the HTTP tests' fake-backed one so both register exactly the same set.
 */
export function geographyHandlerRegistrations(base: GeographyHandlerDependencies): HandlerRegistration[] {
  // The city list's readiness column is the same checklist as the readiness page (US3).
  const deps = { ...base, readiness: new ReadinessSummarizer(base) };
  return [
    { requestType: GetReadinessQuery, handler: new GetReadinessQueryHandler(deps) },
    { requestType: ListTimeZonesQuery, handler: new ListTimeZonesQueryHandler() },
    { requestType: ListCitiesQuery, handler: new ListCitiesQueryHandler(deps) },
    { requestType: GetCityQuery, handler: new GetCityQueryHandler(deps) },
    { requestType: SaveCityCommand, handler: new SaveCityCommandHandler(deps) },
    { requestType: DeleteCityCommand, handler: new DeleteCityCommandHandler(deps) },
    { requestType: ValidateZoneGeometryQuery, handler: new ValidateZoneGeometryQueryHandler(deps) },
    { requestType: ListZonesQuery, handler: new ListZonesQueryHandler(deps) },
    { requestType: ListZoneShapesQuery, handler: new ListZoneShapesQueryHandler(deps) },
    { requestType: GetZoneQuery, handler: new GetZoneQueryHandler(deps) },
    { requestType: SaveZoneCommand, handler: new SaveZoneCommandHandler(deps) },
    { requestType: DeleteZoneCommand, handler: new DeleteZoneCommandHandler(deps) },
    { requestType: ListCountriesQuery, handler: new ListCountriesQueryHandler(deps) },
    { requestType: GetCountryQuery, handler: new GetCountryQueryHandler(deps) },
    { requestType: ListRegionsQuery, handler: new ListRegionsQueryHandler(deps) },
    { requestType: GetRegionQuery, handler: new GetRegionQueryHandler(deps) },
    { requestType: SaveCountryCommand, handler: new SaveCountryCommandHandler(deps) },
    { requestType: SaveRegionCommand, handler: new SaveRegionCommandHandler(deps) },
    { requestType: DeleteRegionCommand, handler: new DeleteRegionCommandHandler(deps) },
    { requestType: ListDocumentTypesQuery, handler: new ListDocumentTypesQueryHandler(deps) },
    { requestType: GetDocumentTypeQuery, handler: new GetDocumentTypeQueryHandler(deps) },
    { requestType: ListMatchSurfacesQuery, handler: new ListMatchSurfacesQueryHandler(deps) },
    { requestType: GetMatchSurfaceQuery, handler: new GetMatchSurfaceQueryHandler(deps) },
    { requestType: SaveDocumentTypeCommand, handler: new SaveDocumentTypeCommandHandler(deps) },
    { requestType: DeleteDocumentTypeCommand, handler: new DeleteDocumentTypeCommandHandler(deps) },
    { requestType: SaveMatchSurfaceCommand, handler: new SaveMatchSurfaceCommandHandler(deps) },
    { requestType: DeleteMatchSurfaceCommand, handler: new DeleteMatchSurfaceCommandHandler(deps) },
  ];
}
