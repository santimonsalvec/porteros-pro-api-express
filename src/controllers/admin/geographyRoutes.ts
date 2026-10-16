import type { Request, Response } from 'express';
import type { ISender } from '../../application/common/mediator/types.js';
import type { DeleteResult } from '../../application/features/geography/common/deletion.js';
import type { Warning } from '../../application/features/geography/common/warnings.js';
import { DeleteCityCommand } from '../../application/features/geography/commands/deleteCity/deleteCityCommand.js';
import { SaveCityCommand, type SaveCityResult } from '../../application/features/geography/commands/saveCity/saveCityCommand.js';
import { GetCityQuery } from '../../application/features/geography/queries/getCity/getCityQuery.js';
import { ListCitiesQuery } from '../../application/features/geography/queries/listCities/listCitiesQuery.js';
import { ListTimeZonesQuery } from '../../application/features/geography/queries/listTimeZones/listTimeZonesQuery.js';
import { DeleteZoneCommand } from '../../application/features/geography/commands/deleteZone/deleteZoneCommand.js';
import { ReorderZonesCommand } from '../../application/features/geography/commands/reorderZones/reorderZonesCommand.js';
import { SaveZoneCommand, type SaveZoneResult } from '../../application/features/geography/commands/saveZone/saveZoneCommand.js';
import { GetZoneQuery } from '../../application/features/geography/queries/getZone/getZoneQuery.js';
import { ListZonesQuery } from '../../application/features/geography/queries/listZones/listZonesQuery.js';
import { ListZoneShapesQuery } from '../../application/features/geography/queries/listZoneShapes/listZoneShapesQuery.js';
import { ValidateZoneGeometryQuery } from '../../application/features/geography/queries/validateZoneGeometry/validateZoneGeometryQuery.js';
import { SaveCountryCommand, type SaveCountryResult } from '../../application/features/geography/commands/saveCountry/saveCountryCommand.js';
import { SaveRegionCommand, type SaveRegionResult } from '../../application/features/geography/commands/saveRegion/saveRegionCommand.js';
import { DeleteRegionCommand } from '../../application/features/geography/commands/deleteRegion/deleteRegionCommand.js';
import { GetCountryQuery } from '../../application/features/geography/queries/getCountry/getCountryQuery.js';
import { ListCountriesQuery } from '../../application/features/geography/queries/listCountries/listCountriesQuery.js';
import { GetRegionQuery } from '../../application/features/geography/queries/getRegion/getRegionQuery.js';
import { ListRegionsQuery } from '../../application/features/geography/queries/listRegions/listRegionsQuery.js';
import { ApiError } from '../apiError.js';
import { zodFieldErrors } from '../requests/goalkeeperRequests/getServiceQuoteRequest.js';
import {
  createCityRequestSchema,
  createCountryRequestSchema,
  createRegionRequestSchema,
  createZoneRequestSchema,
  deleteRequestSchema,
  listCitiesQuerySchema,
  listCountriesQuerySchema,
  listRegionsQuerySchema,
  listZonesQuerySchema,
  reorderZonesRequestSchema,
  updateCityRequestSchema,
  updateCountryRequestSchema,
  updateRegionRequestSchema,
  updateZoneRequestSchema,
  validateZoneRequestSchema,
} from '../requests/geography/geographyRequests.js';
import { atLevel, type createAdminRouting } from './adminRoute.js';

/**
 * Countries, regions, cities and zones in the admin web (spec 003 of the admin,
 * contracts/geography-api.md). The helpers below are shared with the catalog and readiness routes.
 */

export type Route = ReturnType<typeof createAdminRouting>['route'];

const VALIDATION_MESSAGE = 'One or more fields are missing or invalid.';

export const invalid = (error: Parameters<typeof zodFieldErrors>[0]) =>
  new ApiError(400, 'validation_failed', VALIDATION_MESSAGE, zodFieldErrors(error));

export const invalidFields = (fieldErrors: Record<string, string>) => new ApiError(400, 'validation_failed', VALIDATION_MESSAGE, fieldErrors);

export const stale = () => new ApiError(409, 'stale_revision', 'This record changed since it was read; reload it and try again.');

export const notFound = (code: string) => new ApiError(404, code, 'No record exists with this id.');

export const conflict = (code: string, message = 'This change conflicts with how the record is used.') => new ApiError(409, code, message);

/** Held back until it is sent again with `acknowledgeWarnings: true` (research §4). */
export const warningsUnacknowledged = (warnings: readonly Warning[]) =>
  new ApiError(409, 'warnings_unacknowledged', 'This change has warnings to confirm before it is saved.', undefined, { warnings });

/** Parses a body or query with `schema`, or answers `400 validation_failed` with its fields. */
export function parse<T>(schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false; error: Parameters<typeof invalid>[0] } }, value: unknown): T {
  const parsed = schema.safeParse(value ?? {});
  if (!parsed.success) throw invalid(parsed.error);
  return parsed.data;
}

/** Answers a delete: `204`, `404 <notFoundCode>` or `409 <reason>`. */
export function sendDeleted(res: Response, result: DeleteResult, notFoundCode: string): void {
  switch (result.outcome) {
    case 'deleted':
      // `res.json` is what writes the audit entry: the 204 goes out with an empty body.
      res.status(204).json(null);
      return;
    case 'not_found':
      throw notFound(notFoundCode);
    case 'in_use':
      throw conflict(result.reason);
  }
}

const param = (req: Request, name: string) => String(req.params[name]);

export function registerGeographyRoutes(route: Route, mediator: ISender): void {
  registerCountryRoutes(route, mediator);
  registerRegionRoutes(route, mediator);
  registerCityRoutes(route, mediator);
  // Zones belong to a market (spec 031, contract B1).
  registerZoneRoutes(atLevel(route, 'market'), mediator);
}

/** Countries (US4): their currency is locked once they operate (clarification 3). A country is never deleted. */
function registerCountryRoutes(route: Route, mediator: ISender): void {
  const countryView = async (countryId: string) => {
    const result = await mediator.send(new GetCountryQuery(countryId));
    if (result.outcome === 'not_found') throw notFound('country_not_found');
    return result.country;
  };
  const audit = (action: string) => ({
    permission: 'geography.manage' as const,
    audit: {
      action,
      resourceType: 'country',
      resourceId: (req: Request) => param(req, 'countryId'),
      before: async (req: Request) => {
        const result = await mediator.send(new GetCountryQuery(param(req, 'countryId')));
        return result.outcome === 'ok' ? result.country : null;
      },
    },
  });
  const sendSaved = async (res: Response, result: SaveCountryResult) => {
    switch (result.outcome) {
      case 'saved':
        res.locals.auditResourceId = result.countryId;
        res.status(result.created ? 201 : 200).json(await countryView(result.countryId));
        return;
      case 'not_found':
        throw notFound('country_not_found');
      case 'stale':
        throw stale();
      case 'country_code_taken':
        throw new ApiError(409, 'country_code_taken', 'Another country already has this code.', { countryCode: 'Another country already has this code.' });
      case 'currency_locked':
        throw new ApiError(409, 'currency_locked', 'The currency of a country that operates cannot change.', { currency: 'Locked: the country operates.' });
      case 'warnings':
        throw warningsUnacknowledged(result.warnings);
    }
  };

  route('get', '/countries', 'geography.read', async (req, res) => {
    const { page, pageSize, ...filters } = parse(listCountriesQuerySchema, req.query);
    res.status(200).json(await mediator.send(new ListCountriesQuery(filters, page, pageSize)));
  });

  route('get', '/countries/:countryId', 'geography.read', async (req, res) => {
    res.status(200).json(await countryView(req.params.countryId));
  });

  route(
    'post',
    '/countries',
    { permission: 'geography.manage', audit: { action: 'country.create', resourceType: 'country', resourceId: () => 'new' } },
    async (req, res) => {
      const { acknowledgeWarnings, ...fields } = parse(createCountryRequestSchema, req.body);
      await sendSaved(res, await mediator.send(SaveCountryCommand.create(fields, acknowledgeWarnings)));
    },
  );

  route('patch', '/countries/:countryId', audit('country.update'), async (req, res) => {
    const { revision, acknowledgeWarnings, ...changes } = parse(updateCountryRequestSchema, req.body);
    await sendSaved(res, await mediator.send(SaveCountryCommand.edit(req.params.countryId, revision, changes, acknowledgeWarnings)));
  });
}

/** Regions (US4). */
function registerRegionRoutes(route: Route, mediator: ISender): void {
  const regionView = async (regionId: string) => {
    const result = await mediator.send(new GetRegionQuery(regionId));
    if (result.outcome === 'not_found') throw notFound('region_not_found');
    return result.region;
  };
  const audit = (action: string) => ({
    permission: 'geography.manage' as const,
    audit: {
      action,
      resourceType: 'region',
      resourceId: (req: Request) => param(req, 'regionId'),
      before: async (req: Request) => {
        const result = await mediator.send(new GetRegionQuery(param(req, 'regionId')));
        return result.outcome === 'ok' ? result.region : null;
      },
    },
  });
  const sendSaved = async (res: Response, result: SaveRegionResult) => {
    switch (result.outcome) {
      case 'saved':
        res.locals.auditResourceId = result.regionId;
        res.status(result.created ? 201 : 200).json(await regionView(result.regionId));
        return;
      case 'not_found':
        throw notFound('region_not_found');
      case 'stale':
        throw stale();
      case 'invalid':
        throw invalidFields(result.fieldErrors);
    }
  };

  route('get', '/regions', 'geography.read', async (req, res) => {
    const { page, pageSize, ...filters } = parse(listRegionsQuerySchema, req.query);
    res.status(200).json(await mediator.send(new ListRegionsQuery(filters, page, pageSize)));
  });

  route('get', '/regions/:regionId', 'geography.read', async (req, res) => {
    res.status(200).json(await regionView(req.params.regionId));
  });

  route(
    'post',
    '/regions',
    { permission: 'geography.manage', audit: { action: 'region.create', resourceType: 'region', resourceId: () => 'new' } },
    async (req, res) => {
      await sendSaved(res, await mediator.send(SaveRegionCommand.create(parse(createRegionRequestSchema, req.body))));
    },
  );

  route('patch', '/regions/:regionId', audit('region.update'), async (req, res) => {
    const { revision, ...changes } = parse(updateRegionRequestSchema, req.body);
    await sendSaved(res, await mediator.send(SaveRegionCommand.edit(req.params.regionId, revision, changes)));
  });

  route('post', '/regions/:regionId/delete', audit('region.delete'), async (req, res) => {
    parse(deleteRequestSchema, req.body);
    sendDeleted(res, await mediator.send(new DeleteRegionCommand(req.params.regionId)), 'region_not_found');
  });
}

const REASON_REQUIRED = { reason: 'A reason of 3–300 characters is required.' };

/** An active zone that would cross or touch another active one (spec 031, FR-003). */
const zoneConflict = (conflicts: unknown[]) =>
  new ApiError(422, 'zone_conflict', 'The zone crosses or touches another active zone.', undefined, { conflicts });

/** Zones and their polygons (US2). */
function registerZoneRoutes(route: Route, mediator: ISender): void {
  const zoneView = async (zoneId: string) => {
    const result = await mediator.send(new GetZoneQuery(zoneId));
    if (result.outcome === 'not_found') throw notFound('zone_not_found');
    return result.zone;
  };
  const zoneBefore = async (req: Request) => {
    const result = await mediator.send(new GetZoneQuery(param(req, 'zoneId')));
    return result.outcome === 'ok' ? result.zone : null;
  };
  const sendSaved = async (res: Response, result: SaveZoneResult) => {
    switch (result.outcome) {
      case 'saved':
        res.locals.auditAction = `zone.${result.action}`;
        res.locals.auditResourceId = result.zoneId;
        res.status(result.action === 'create' ? 201 : 200).json(await zoneView(result.zoneId));
        return;
      case 'not_found':
        throw notFound('zone_not_found');
      case 'stale':
        throw stale();
      case 'zone_slug_taken':
        throw new ApiError(409, 'zone_slug_taken', 'Another zone already has this slug.', { slug: 'Another zone already has this slug.' });
      case 'invalid_geometry':
        throw new ApiError(400, 'validation_failed', 'One or more fields are missing or invalid.', { geometry: 'The polygon breaks a rule.' }, { geometryErrors: result.errors });
      case 'reason_required':
        throw invalidFields(REASON_REQUIRED);
      case 'zone_conflict':
        throw zoneConflict(result.conflicts);
      case 'zone_market_immutable':
        throw new ApiError(409, 'zone_market_immutable', 'A zone never moves to another market.');
      case 'market_not_found':
        throw invalidFields({ marketId: 'Market not found.' });
    }
  };

  route('get', '/zones', 'geography.read', async (req, res) => {
    const { marketId } = parse(listZonesQuerySchema, req.query);
    const result = await mediator.send(new ListZonesQuery(marketId));
    switch (result.outcome) {
      case 'ok':
        res.status(200).json({ market: result.market, items: result.items });
        return;
      case 'market_not_found':
        throw notFound('market_not_found');
    }
  });

  // The polygons for the map, simplified: the list above carries none (real ones weigh ~300 KB each).
  route('get', '/zones/shapes', 'geography.read', async (req, res) => {
    const { marketId } = parse(listZonesQuerySchema, req.query);
    const result = await mediator.send(new ListZoneShapesQuery(marketId));
    switch (result.outcome) {
      case 'ok':
        res.status(200).json({ items: result.items });
        return;
      case 'market_not_found':
        throw notFound('market_not_found');
    }
  });

  route('get', '/zones/:zoneId', 'geography.read', async (req, res) => {
    res.status(200).json(await zoneView(req.params.zoneId));
  });

  // Checks a polygon while it is drawn: neither saved nor audited (research §3).
  route('post', '/zones/validate', 'geography.manage', async (req, res) => {
    const body = parse(validateZoneRequestSchema, req.body);
    const result = await mediator.send(new ValidateZoneGeometryQuery(body.marketId, body.geometry, body.zoneId ?? null, body.active ?? true));
    switch (result.outcome) {
      case 'ok':
        if (result.conflicts.length > 0) throw zoneConflict(result.conflicts);
        res.status(200).json({ errors: result.errors });
        return;
      case 'market_not_found':
        throw notFound('market_not_found');
    }
  });

  const zonesOf = async (marketId: string) => {
    const result = await mediator.send(new ListZonesQuery(marketId));
    return result.outcome === 'ok' ? { market: result.market, items: result.items } : null;
  };

  // The order the app shows the zones in, dragged in the admin's list: answers the list as `GET /zones`.
  route(
    'post',
    '/zones/reorder',
    {
      permission: 'geography.manage',
      audit: {
        action: 'zone.reorder',
        resourceType: 'zoneOrder',
        resourceId: (req: Request) => String((req.body as { marketId?: unknown } | undefined)?.marketId ?? ''),
        before: (req: Request) => zonesOf(String((req.body as { marketId?: unknown } | undefined)?.marketId ?? '')),
      },
    },
    async (req, res) => {
      const { marketId, zones } = parse(reorderZonesRequestSchema, req.body);
      const result = await mediator.send(new ReorderZonesCommand(marketId, zones));
      switch (result.outcome) {
        case 'reordered':
          res.status(200).json(await zonesOf(marketId));
          return;
        case 'stale':
          throw stale();
        case 'market_not_found':
          throw notFound('market_not_found');
      }
    },
  );

  route(
    'post',
    '/zones',
    { permission: 'geography.manage', audit: { action: 'zone.create', resourceType: 'zone', resourceId: () => 'new' } },
    async (req, res) => {
      const fields = parse(createZoneRequestSchema, req.body);
      await sendSaved(res, await mediator.send(SaveZoneCommand.create(fields)));
    },
  );

  const zoneAudit = (action: string) => ({
    permission: 'geography.manage' as const,
    audit: { action, resourceType: 'zone', resourceId: (req: Request) => param(req, 'zoneId'), before: zoneBefore },
  });

  route('patch', '/zones/:zoneId', zoneAudit('zone.update'), async (req, res) => {
    const { revision, reason, ...changes } = parse(updateZoneRequestSchema, req.body);
    await sendSaved(res, await mediator.send(SaveZoneCommand.edit(req.params.zoneId, revision, changes, reason ?? null)));
  });

  route('post', '/zones/:zoneId/delete', zoneAudit('zone.delete'), async (req, res) => {
    parse(deleteRequestSchema, req.body);
    sendDeleted(res, await mediator.send(new DeleteZoneCommand(req.params.zoneId)), 'zone_not_found');
  });
}

/** The municipalities of the billing catalog (US1; spec 031). */
function registerCityRoutes(route: Route, mediator: ISender): void {
  const cityView = async (cityId: string) => {
    const result = await mediator.send(new GetCityQuery(cityId));
    if (result.outcome === 'not_found') throw notFound('city_not_found');
    return result.city;
  };
  const cityBefore = async (req: Request) => {
    const result = await mediator.send(new GetCityQuery(param(req, 'cityId')));
    return result.outcome === 'ok' ? result.city : null;
  };
  const cityAudit = (action: string) => ({
    permission: 'geography.manage' as const,
    audit: { action, resourceType: 'city', resourceId: (req: Request) => param(req, 'cityId'), before: cityBefore },
  });
  const sendSaved = async (res: Response, result: SaveCityResult) => {
    switch (result.outcome) {
      case 'saved':
        res.locals.auditResourceId = result.cityId;
        res.status(result.created ? 201 : 200).json(await cityView(result.cityId));
        return;
      case 'not_found':
        throw notFound('city_not_found');
      case 'stale':
        throw stale();
      case 'invalid':
        throw invalidFields(result.fieldErrors);
    }
  };

  route('get', '/time-zones', 'geography.read', async (_req, res) => {
    res.set('Cache-Control', 'private, max-age=86400');
    res.status(200).json(await mediator.send(new ListTimeZonesQuery()));
  });

  route('get', '/cities', 'geography.read', async (req, res) => {
    const { page, pageSize, ...filters } = parse(listCitiesQuerySchema, req.query);
    res.status(200).json(await mediator.send(new ListCitiesQuery(filters, page, pageSize)));
  });

  route('get', '/cities/:cityId', 'geography.read', async (req, res) => {
    res.status(200).json(await cityView(req.params.cityId));
  });

  route(
    'post',
    '/cities',
    { permission: 'geography.manage', audit: { action: 'city.create', resourceType: 'city', resourceId: () => 'new' } },
    async (req, res) => {
      const fields = parse(createCityRequestSchema, req.body);
      await sendSaved(res, await mediator.send(SaveCityCommand.create(fields)));
    },
  );

  route('patch', '/cities/:cityId', cityAudit('city.update'), async (req, res) => {
    const { revision, ...changes } = parse(updateCityRequestSchema, req.body);
    await sendSaved(res, await mediator.send(SaveCityCommand.edit(req.params.cityId, revision, changes)));
  });

  route('post', '/cities/:cityId/delete', cityAudit('city.delete'), async (req, res) => {
    parse(deleteRequestSchema, req.body);
    sendDeleted(res, await mediator.send(new DeleteCityCommand(req.params.cityId)), 'city_not_found');
  });
}
