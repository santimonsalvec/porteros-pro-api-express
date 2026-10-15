import type { Request, Response } from 'express';
import type { ISender } from '../../application/common/mediator/types.js';
import { CreateRentalRateCommand, type CreateRentalRateResult } from '../../application/features/pricing/commands/createRentalRate/createRentalRateCommand.js';
import { DeleteRentalRateCommand } from '../../application/features/pricing/commands/deleteRentalRate/deleteRentalRateCommand.js';
import { UpdateRentalRateCommand, type UpdatePriceResult } from '../../application/features/pricing/commands/updateRentalRate/updateRentalRateCommand.js';
import type { TargetFailure } from '../../application/features/pricing/common/pricingGeography.js';
import { GetRentalRateQuery } from '../../application/features/pricing/queries/getRentalRate/getRentalRateQuery.js';
import { GetRentalRateDeleteImpactQuery } from '../../application/features/pricing/queries/getRentalRateDeleteImpact/getRentalRateDeleteImpactQuery.js';
import { ListRentalRatesQuery } from '../../application/features/pricing/queries/listRentalRates/listRentalRatesQuery.js';
import { CreateCommissionCommand, type CreateCommissionResult } from '../../application/features/pricing/commands/createCommission/createCommissionCommand.js';
import { DeleteCommissionCommand } from '../../application/features/pricing/commands/deleteCommission/deleteCommissionCommand.js';
import { UpdateCommissionCommand, type UpdateCommissionResult } from '../../application/features/pricing/commands/updateCommission/updateCommissionCommand.js';
import { GetCommissionQuery } from '../../application/features/pricing/queries/getCommission/getCommissionQuery.js';
import { GetCommissionDeleteImpactQuery } from '../../application/features/pricing/queries/getCommissionDeleteImpact/getCommissionDeleteImpactQuery.js';
import { ListCommissionsQuery } from '../../application/features/pricing/queries/listCommissions/listCommissionsQuery.js';
import { GetPricingPreviewQuery } from '../../application/features/pricing/queries/getPricingPreview/getPricingPreviewQuery.js';
import { ListPricingAreasQuery } from '../../application/features/pricing/queries/listPricingAreas/listPricingAreasQuery.js';
import { SaveCountryBookingSettingsCommand, type SaveBookingSettingsResult } from '../../application/features/pricing/commands/saveCountryBookingSettings/saveCountryBookingSettingsCommand.js';
import { SaveCityBookingSettingsCommand, type SaveCityBookingSettingsResult } from '../../application/features/pricing/commands/saveCityBookingSettings/saveCityBookingSettingsCommand.js';
import { GetCountryBookingSettingsQuery } from '../../application/features/pricing/queries/getCountryBookingSettings/getCountryBookingSettingsQuery.js';
import { GetCityBookingSettingsQuery, type GetCityBookingSettingsResult } from '../../application/features/pricing/queries/getCityBookingSettings/getCityBookingSettingsQuery.js';
import { ApiError } from '../apiError.js';
import {
  cityBookingSettingsRequestSchema,
  countryBookingSettingsRequestSchema,
  createCommissionRequestSchema,
  createRentalRateRequestSchema,
  deleteRequestSchema,
  listCommissionsQuerySchema,
  listRentalRatesQuerySchema,
  pricingPreviewQuerySchema,
  updatePriceRequestSchema,
} from '../requests/pricing/pricingRequests.js';
import { conflict, invalidFields, notFound, parse, sendDeleted, stale, warningsUnacknowledged, type Route } from './geographyRoutes.js';
import {
  createUnverifiedDiscountRequestSchema,
  deleteUnverifiedDiscountRequestSchema,
  listUnverifiedDiscountsQuerySchema,
  updateUnverifiedDiscountRequestSchema,
} from '../requests/pricing/unverifiedDiscountRequests.js';
import { ListUnverifiedDiscountsQuery } from '../../application/features/pricing/queries/listUnverifiedDiscounts/listUnverifiedDiscountsQuery.js';
import { CreateUnverifiedDiscountCommand } from '../../application/features/pricing/commands/createUnverifiedDiscount/createUnverifiedDiscountCommand.js';
import { UpdateUnverifiedDiscountCommand } from '../../application/features/pricing/commands/updateUnverifiedDiscount/updateUnverifiedDiscountCommand.js';
import { DeleteUnverifiedDiscountCommand } from '../../application/features/pricing/commands/deleteUnverifiedDiscount/deleteUnverifiedDiscountCommand.js';

/**
 * Prices and booking rules in the admin web (spec 004 of the admin, contracts/pricing-api.md):
 * read with `pricing.read`, written with `pricing.manage`. VAT keeps its own routes in
 * `adminController.ts`.
 */
export function registerPricingRoutes(route: Route, mediator: ISender): void {
  registerRentalRateRoutes(route, mediator);
  registerCommissionRoutes(route, mediator);
  registerUnverifiedDiscountRoutes(route, mediator);
  registerBookingSettingsRoutes(route, mediator);
  registerPreviewRoute(route, mediator);
}

const param = (req: Request, name: string) => String(req.params[name]);

/** A price that cannot point at its target: unknown → 404; a satellite city or no currency → 409. */
export function targetError(failure: TargetFailure): ApiError {
  switch (failure.outcome) {
    case 'zone_not_found':
    case 'city_not_found':
    case 'country_not_found':
      return notFound(failure.outcome);
    case 'city_not_anchor':
      return new ApiError(409, 'city_not_anchor', 'This city uses the zones of another; its prices and rules are its anchor city\'s.', undefined, {
        anchorCityId: failure.anchorCityId,
      });
    case 'country_without_currency':
      return conflict('country_without_currency', 'The country has no currency to price in.');
  }
}

function registerRentalRateRoutes(route: Route, mediator: ISender): void {
  const view = async (rateId: string) => {
    const result = await mediator.send(new GetRentalRateQuery(rateId));
    if (result.outcome === 'not_found') throw notFound('rate_not_found');
    return result.rate;
  };
  const audit = (action: string) => ({
    permission: 'pricing.manage' as const,
    audit: {
      action,
      resourceType: 'rentalRate',
      resourceId: (req: Request) => param(req, 'rateId'),
      before: async (req: Request) => {
        const result = await mediator.send(new GetRentalRateQuery(param(req, 'rateId')));
        return result.outcome === 'ok' ? result.rate : null;
      },
    },
  });
  const sendCreated = async (res: Response, result: CreateRentalRateResult) => {
    switch (result.outcome) {
      case 'saved':
        res.locals.auditResourceId = result.rateId;
        res.status(201).json(await view(result.rateId));
        return;
      case 'invalid':
        throw invalidFields(result.fieldErrors);
      case 'duplicate':
        throw new ApiError(409, 'rate_already_exists', 'A rate already exists for this combination.', undefined, { existingId: result.existingId });
      default:
        throw targetError(result);
    }
  };
  const sendUpdated = async (res: Response, result: UpdatePriceResult) => {
    switch (result.outcome) {
      case 'saved':
        res.status(200).json(await view(result.rateId));
        return;
      case 'invalid':
        throw invalidFields(result.fieldErrors);
      case 'not_found':
        throw notFound('rate_not_found');
      case 'stale':
        throw stale();
    }
  };

  route('get', '/rental-rates', 'pricing.read', async (req, res) => {
    const { page, pageSize, ...filters } = parse(listRentalRatesQuerySchema, req.query);
    res.status(200).json(await mediator.send(new ListRentalRatesQuery(filters, page, pageSize)));
  });

  route('get', '/rental-rates/:rateId', 'pricing.read', async (req, res) => {
    res.status(200).json(await view(req.params.rateId));
  });

  route('get', '/rental-rates/:rateId/delete-impact', 'pricing.read', async (req, res) => {
    const result = await mediator.send(new GetRentalRateDeleteImpactQuery(req.params.rateId));
    if (result.outcome === 'not_found') throw notFound('rate_not_found');
    res.status(200).json(result.impact);
  });

  route(
    'post',
    '/rental-rates',
    { permission: 'pricing.manage', audit: { action: 'rentalRate.create', resourceType: 'rentalRate', resourceId: () => 'new' } },
    async (req, res) => {
      await sendCreated(res, await mediator.send(new CreateRentalRateCommand(parse(createRentalRateRequestSchema, req.body))));
    },
  );

  route('patch', '/rental-rates/:rateId', audit('rentalRate.update'), async (req, res) => {
    const { revision, amount } = parse(updatePriceRequestSchema, req.body);
    await sendUpdated(res, await mediator.send(new UpdateRentalRateCommand(req.params.rateId, revision, amount)));
  });

  route('post', '/rental-rates/:rateId/delete', audit('rentalRate.delete'), async (req, res) => {
    parse(deleteRequestSchema, req.body);
    sendDeleted(res, await mediator.send(new DeleteRentalRateCommand(req.params.rateId)), 'rate_not_found');
  });
}

function registerCommissionRoutes(route: Route, mediator: ISender): void {
  const view = async (commissionId: string) => {
    const result = await mediator.send(new GetCommissionQuery(commissionId));
    if (result.outcome === 'not_found') throw notFound('commission_not_found');
    return result.commission;
  };
  const audit = (action: string) => ({
    permission: 'pricing.manage' as const,
    audit: {
      action,
      resourceType: 'commissionSetting',
      resourceId: (req: Request) => param(req, 'commissionId'),
      before: async (req: Request) => {
        const result = await mediator.send(new GetCommissionQuery(param(req, 'commissionId')));
        return result.outcome === 'ok' ? result.commission : null;
      },
    },
  });
  const sendCreated = async (res: Response, result: CreateCommissionResult) => {
    switch (result.outcome) {
      case 'saved':
        res.locals.auditResourceId = result.commissionId;
        res.status(201).json(await view(result.commissionId));
        return;
      case 'invalid':
        throw invalidFields(result.fieldErrors);
      case 'duplicate':
        throw new ApiError(409, 'commission_already_exists', 'A commission already exists for this combination.', undefined, {
          existingId: result.existingId,
        });
      default:
        throw targetError(result);
    }
  };
  const sendUpdated = async (res: Response, result: UpdateCommissionResult) => {
    switch (result.outcome) {
      case 'saved':
        res.status(200).json(await view(result.commissionId));
        return;
      case 'invalid':
        throw invalidFields(result.fieldErrors);
      case 'not_found':
        throw notFound('commission_not_found');
      case 'stale':
        throw stale();
    }
  };

  route('get', '/commissions', 'pricing.read', async (req, res) => {
    const { page, pageSize, ...filters } = parse(listCommissionsQuerySchema, req.query);
    res.status(200).json(await mediator.send(new ListCommissionsQuery(filters, page, pageSize)));
  });

  route('get', '/commissions/:commissionId', 'pricing.read', async (req, res) => {
    res.status(200).json(await view(req.params.commissionId));
  });

  route('get', '/commissions/:commissionId/delete-impact', 'pricing.read', async (req, res) => {
    const result = await mediator.send(new GetCommissionDeleteImpactQuery(req.params.commissionId));
    if (result.outcome === 'not_found') throw notFound('commission_not_found');
    res.status(200).json(result.impact);
  });

  route(
    'post',
    '/commissions',
    { permission: 'pricing.manage', audit: { action: 'commission.create', resourceType: 'commissionSetting', resourceId: () => 'new' } },
    async (req, res) => {
      await sendCreated(res, await mediator.send(new CreateCommissionCommand(parse(createCommissionRequestSchema, req.body))));
    },
  );

  route('patch', '/commissions/:commissionId', audit('commission.update'), async (req, res) => {
    const { revision, amount } = parse(updatePriceRequestSchema, req.body);
    await sendUpdated(res, await mediator.send(new UpdateCommissionCommand(req.params.commissionId, revision, amount)));
  });

  route('post', '/commissions/:commissionId/delete', audit('commission.delete'), async (req, res) => {
    parse(deleteRequestSchema, req.body);
    sendDeleted(res, await mediator.send(new DeleteCommissionCommand(req.params.commissionId)), 'commission_not_found');
  });
}

const VALIDATION_MESSAGE = 'One or more fields are missing or invalid.';

/** A satellite city's rules are its anchor's: `409` with where to go. */
const notAnchor = (anchorCityId: string) =>
  new ApiError(409, 'city_not_anchor', "This city uses the zones of another; its prices and rules are its anchor city's.", undefined, { anchorCityId });

function registerBookingSettingsRoutes(route: Route, mediator: ISender): void {
  const countryView = async (countryId: string) => {
    const result = await mediator.send(new GetCountryBookingSettingsQuery(countryId));
    if (result.outcome === 'not_found') throw notFound('country_not_found');
    return result.settings;
  };
  const cityView = async (cityId: string) => {
    const result: GetCityBookingSettingsResult = await mediator.send(new GetCityBookingSettingsQuery(cityId));
    if (result.outcome === 'not_found') throw notFound('city_not_found');
    if (result.outcome === 'city_not_anchor') throw notAnchor(result.anchorCityId);
    return result.settings;
  };
  const sendSaved = async (res: Response, result: SaveBookingSettingsResult | SaveCityBookingSettingsResult, view: () => Promise<unknown>, notFoundCode: string) => {
    switch (result.outcome) {
      case 'saved':
        res.status(200).json(await view());
        return;
      case 'not_found':
        throw notFound(notFoundCode);
      case 'city_not_anchor':
        throw notAnchor(result.anchorCityId);
      case 'stale':
        throw stale();
      case 'invalid':
        throw invalidFields(result.fieldErrors);
      case 'notice_violation':
        // FR-010: the levels that would be left with a search ending before it starts.
        throw new ApiError(400, 'validation_failed', VALIDATION_MESSAGE, { minNoticeMinutes: 'min_notice_not_above_travel_buffer' }, {
          violations: result.violations,
        });
      case 'warnings':
        throw warningsUnacknowledged(result.warnings);
    }
  };

  route('get', '/booking-settings/countries/:countryId', 'pricing.read', async (req, res) => {
    res.status(200).json(await countryView(req.params.countryId));
  });

  route('get', '/booking-settings/cities/:cityId', 'pricing.read', async (req, res) => {
    res.status(200).json(await cityView(req.params.cityId));
  });

  route(
    'put',
    '/booking-settings/countries/:countryId',
    {
      permission: 'pricing.manage',
      audit: {
        action: 'bookingSettings.country.update',
        resourceType: 'bookingSettings',
        resourceId: (req) => param(req, 'countryId'),
        before: (req) => countryView(param(req, 'countryId')).catch(() => null),
      },
    },
    async (req, res) => {
      const { revision, acknowledgeWarnings, ...fields } = parse(countryBookingSettingsRequestSchema, req.body);
      const countryId = req.params.countryId;
      const result = await mediator.send(new SaveCountryBookingSettingsCommand(countryId, revision, fields, acknowledgeWarnings ?? false));
      await sendSaved(res, result, () => countryView(countryId), 'country_not_found');
    },
  );

  route(
    'put',
    '/booking-settings/cities/:cityId',
    {
      permission: 'pricing.manage',
      audit: {
        action: 'bookingSettings.city.update',
        resourceType: 'bookingSettings',
        resourceId: (req) => param(req, 'cityId'),
        before: (req) => cityView(param(req, 'cityId')).catch(() => null),
      },
    },
    async (req, res) => {
      const { revision, acknowledgeWarnings, ...fields } = parse(cityBookingSettingsRequestSchema, req.body);
      const cityId = req.params.cityId;
      const result = await mediator.send(new SaveCityBookingSettingsCommand(cityId, revision, fields, acknowledgeWarnings ?? false));
      await sendSaved(res, result, () => cityView(cityId), 'city_not_found');
    },
  );
}

/** The simulator only reads: no audit entry, no quote, no booking (FR-015). */
function registerPreviewRoute(route: Route, mediator: ISender): void {
  route('get', '/pricing/areas', 'pricing.read', async (_req, res) => {
    res.status(200).json(await mediator.send(new ListPricingAreasQuery()));
  });

  route('get', '/pricing/preview', 'pricing.read', async (req, res) => {
    const { quoteFromLocal, ...input } = parse(pricingPreviewQuerySchema, req.query);
    const result = await mediator.send(new GetPricingPreviewQuery({ ...input, quoteFromLocal: quoteFromLocal ?? null }));
    switch (result.outcome) {
      case 'ok':
        res.status(200).json(result.preview);
        return;
      case 'not_found':
        throw notFound('zone_not_found');
      case 'invalid':
        throw invalidFields(result.fieldErrors);
      case 'time_zone_not_configured':
        throw conflict('time_zone_not_configured', "The zone's city has no valid time zone.");
    }
  });
}

/** The discount and verified-only window for goalkeepers without the seal, per country, anchor city or zone (admin spec 030, contracts D1–D4). */
function registerUnverifiedDiscountRoutes(route: Route, mediator: ISender): void {
  const audit = (action: string) => ({
    permission: 'pricing.unverified_discount.manage' as const,
    audit: { action, resourceType: 'unverifiedDiscount', resourceId: (req: Request) => param(req, 'discountId') },
  });

  route('get', '/unverified-discounts', 'pricing.read', async (req, res) => {
    const { countryId } = parse(listUnverifiedDiscountsQuerySchema, req.query);
    const result = await mediator.send(new ListUnverifiedDiscountsQuery(countryId));
    if (result.outcome === 'not_found') throw notFound('country_not_found');
    res.status(200).json(result.view);
  });

  route(
    'post',
    '/unverified-discounts',
    { permission: 'pricing.unverified_discount.manage', audit: { action: 'unverifiedDiscount.create', resourceType: 'unverifiedDiscount', resourceId: () => 'new' } },
    async (req, res) => {
      const result = await mediator.send(new CreateUnverifiedDiscountCommand(parse(createUnverifiedDiscountRequestSchema, req.body)));
      switch (result.outcome) {
        case 'saved':
          res.locals.auditResourceId = result.id;
          res.status(201).json({ id: result.id });
          return;
        case 'invalid':
          throw invalidFields(result.fieldErrors);
        case 'duplicate':
          throw new ApiError(409, 'discount_already_exists', 'This level already has a discount.', undefined, { existingId: result.existingId });
        default:
          throw targetError(result);
      }
    },
  );

  route('patch', '/unverified-discounts/:discountId', audit('unverifiedDiscount.update'), async (req, res) => {
    const { revision, ...fields } = parse(updateUnverifiedDiscountRequestSchema, req.body);
    const result = await mediator.send(new UpdateUnverifiedDiscountCommand(req.params.discountId, revision, fields));
    switch (result.outcome) {
      case 'saved':
        res.status(200).json({ id: result.id, ...fields, revision: revision + 1 });
        return;
      case 'invalid':
        throw invalidFields(result.fieldErrors);
      case 'not_found':
        throw notFound('discount_not_found');
      case 'stale':
        throw stale();
    }
  });

  route('post', '/unverified-discounts/:discountId/delete', audit('unverifiedDiscount.delete'), async (req, res) => {
    const { revision } = parse(deleteUnverifiedDiscountRequestSchema, req.body);
    const result = await mediator.send(new DeleteUnverifiedDiscountCommand(req.params.discountId, revision));
    switch (result.outcome) {
      case 'deleted':
        // `res.json` is what writes the audit entry: the 204 goes out with an empty body.
        res.status(204).json(null);
        return;
      case 'not_found':
        throw notFound('discount_not_found');
      case 'stale':
        throw stale();
    }
  });
}
