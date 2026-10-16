import { Router } from 'express';
import { createAdminRouting, settingsBefore } from './admin/adminRoute.js';
import { registerTeamRoutes } from './admin/teamRoutes.js';
import { registerGeographyRoutes } from './admin/geographyRoutes.js';
import { registerCatalogRoutes } from './admin/catalogRoutes.js';
import { registerPricingRoutes } from './admin/pricingRoutes.js';
import { registerAccountClosureRoutes } from './admin/accountClosuresRoutes.js';
import { registerUsersRoutes } from './admin/usersRoutes.js';
import { registerGoalkeeperAdminRoutes } from './admin/goalkeepersRoutes.js';
import { registerGoalkeeperVettingRoutes } from './admin/goalkeeperVettingRoutes.js';
import { registerReadinessRoutes } from './admin/readinessRoutes.js';
import { registerMarketsRoutes } from './admin/marketsRoutes.js';
import { registerRequestsRoutes } from './admin/requestsRoutes.js';
import { registerCasesRoutes } from './admin/casesRoutes.js';
import { registerNotificationsRoutes } from './admin/notificationsRoutes.js';
import { registerRatingsRoutes } from './admin/ratingsRoutes.js';
import { registerFinanceRoutes } from './admin/financeRoutes.js';
import { registerSettingsRoutes } from './admin/settingsRoutes.js';
import { registerDashboardRoutes } from './admin/dashboardRoutes.js';
import { registerSystemRoutes } from './admin/systemRoutes.js';
import type { ISender } from '../application/common/mediator/types.js';
import { RecordOperatingBalanceAdjustmentCommand } from '../application/features/operatingBalance/commands/recordOperatingBalanceAdjustment/recordOperatingBalanceAdjustmentCommand.js';
import type { AdminWebDependencies } from '../appDependencies.js';
import { requireAdminAuth } from '../infrastructure/auth/middleware/requireAdminAuth.js';
import { scopeOptions } from '../infrastructure/auth/scopeOptions.js';
import { adminCors } from '../infrastructure/http/adminCors.js';
import { GetAdminMeQuery } from '../application/features/staff/queries/getAdminMe/getAdminMeQuery.js';
import { GetPermissionCatalogQuery } from '../application/features/staff/queries/getPermissionCatalog/getPermissionCatalogQuery.js';
import { GetGoalkeeperOperatingBalanceQuery } from '../application/features/operatingBalance/queries/getGoalkeeperOperatingBalance/getGoalkeeperOperatingBalanceQuery.js';
import { ApiError } from './apiError.js';
import { zodFieldErrors } from './requests/goalkeeperRequests/getServiceQuoteRequest.js';
import { recordOperatingBalanceAdjustmentRequestSchema } from './requests/operatingBalance/recordOperatingBalanceAdjustmentRequest.js';
import { goalkeeperNotFound, sendMovements, sendOperatingBalance, operatingBalanceNotConfigured } from './operatingBalance/operatingBalanceHttp.js';
import { ReverseWithdrawalPenaltyCommand } from '../application/features/bookingLifecycle/commands/reverseWithdrawalPenalty/reverseWithdrawalPenaltyCommand.js';
import { reverseWithdrawalRequestSchema } from './requests/withdrawals/reverseWithdrawalRequest.js';
import { sendWithdrawals } from './withdrawals/withdrawalsHttp.js';
import { SetTaxSettingsCommand } from '../application/features/invoicing/commands/setTaxSettings/setTaxSettingsCommand.js';
import { GetTaxSettingsQuery } from '../application/features/invoicing/queries/getTaxSettings/getTaxSettingsQuery.js';
import { taxSettingsRequestSchema } from './requests/invoicing/invoicingRequests.js';

export interface AdminControllerDependencies {
  mediator: ISender;
  admin: AdminWebDependencies;
}

/**
 * Administration endpoints, used by the admin web (porteros-pro-admin). Every route requires an
 * admin web session of an active staff member (spec 001); permissions are checked per route.
 */
export function createAdminController(deps: AdminControllerDependencies): Router {
  const router = Router();

  router.use(
    adminCors({ allowedOrigins: deps.admin.allowedOrigins }),
    requireAdminAuth(deps.admin.verifyAccessToken, deps.admin.accessResolver),
  );

  // Each module works on one level of data (spec 031, contract B1): `X-Scope` selects it.
  const { at } = createAdminRouting(router, deps.admin);
  const [platform, country, market] = [at('platform'), at('country'), at('market')];
  registerTeamRoutes(platform, deps.mediator);
  registerGeographyRoutes(platform, deps.mediator);
  registerMarketsRoutes(market, deps.mediator);
  registerCatalogRoutes(platform, deps.mediator);
  registerPricingRoutes(market, deps.mediator);
  registerUsersRoutes(platform, deps.mediator);
  registerAccountClosureRoutes(country, deps.mediator);
  registerGoalkeeperAdminRoutes(country, deps.mediator);
  registerGoalkeeperVettingRoutes(country, deps.mediator);
  registerRequestsRoutes(market, deps.mediator);
  registerCasesRoutes(market, deps.mediator);
  registerNotificationsRoutes(platform, deps.mediator);
  registerRatingsRoutes(market, deps.mediator);
  registerFinanceRoutes(country, deps.mediator);
  registerDashboardRoutes(market, deps.mediator);
  registerSystemRoutes(platform, deps.mediator);
  registerSettingsRoutes(country, deps.mediator);
  registerReadinessRoutes(market, deps.mediator);
  const route = country;

  // The fixed permission catalog, for the role screen (any active member).
  router.get('/permissions', async (_req, res) => {
    res.status(200).json(await deps.mediator.send(new GetPermissionCatalogQuery()));
  });

  // The countries and markets the member may pick (spec 031, contract B2); no permission of its own.
  router.get('/me/scopes', async (req, res) => {
    const access = req.adminAccess!;
    if (!deps.admin.scope) {
      res.status(200).json({ platform: true, countries: [] });
      return;
    }
    res.status(200).json(await scopeOptions(access, deps.admin.scope));
  });

  // The signed-in member and their effective permissions: the admin web's menu, routes and buttons.
  router.get('/me', async (req, res) => {
    const access = req.adminAccess!;
    const result = await deps.mediator.send(new GetAdminMeQuery(access.staffId, access.sessionId));
    switch (result.outcome) {
      case 'ok':
        res.status(200).json(result.me);
        return;
      case 'not_found':
        res.status(401).end();
        return;
    }
  });

  route('get', '/goalkeepers/:userId/operating-balance', 'operating_balances.read', async (req, res) => {
    await sendOperatingBalance(deps.mediator, req.params.userId, res, { goalkeeperId: req.params.userId });
  });

  route('get', '/goalkeepers/:userId/operating-balance/movements', 'operating_balances.read', async (req, res) => {
    await sendMovements(deps.mediator, req.params.userId, 'admin', req, res);
  });

  route('post', '/goalkeepers/:userId/operating-balance/adjustments', {
    permission: 'operating_balances.adjust',
    audit: {
      action: 'operating_balance.adjust',
      resourceType: 'operatingBalance',
      resourceId: (req) => String(req.params.userId),
      before: async (req) => {
        const result = await deps.mediator.send(new GetGoalkeeperOperatingBalanceQuery(String(req.params.userId)));
        return result.outcome === 'success' ? result.operatingBalance : null;
      },
    },
  }, async (req, res) => {
    const parsed = recordOperatingBalanceAdjustmentRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new ApiError(400, 'validation_failed', 'One or more fields are missing or invalid.', zodFieldErrors(parsed.error));
    }
    const { amount, reason, operationKey } = parsed.data;
    const result = await deps.mediator.send(
      new RecordOperatingBalanceAdjustmentCommand(req.adminAccess!.userId, req.params.userId, amount, reason, operationKey),
    );

    // Exhaustive on purpose: adding an outcome without mapping it here fails compilation.
    switch (result.outcome) {
      case 'recorded':
        res.status(201).json({ ...result.movement, balance: result.balance });
        return;
      case 'replayed':
        res.locals.auditOutcome = 'replayed';
        res.status(200).json({ ...result.movement, balance: result.balance });
        return;
      case 'insufficient_funds':
        throw new ApiError(409, 'insufficient_funds', 'The adjustment would leave the balance below zero.', undefined, {
          balance: result.balance,
        });
      case 'not_a_goalkeeper':
        throw goalkeeperNotFound();
      case 'operating_balance_not_configured':
        throw operatingBalanceNotConfigured(result.marketId);
    }
  });

  // A goalkeeper's withdrawals and penalties, and their reversal (feature 018).
  route('get', '/goalkeepers/:userId/withdrawals', 'goalkeepers.read', async (req, res) => {
    await sendWithdrawals(deps.mediator, req.params.userId, 'admin', req, res);
  });

  route('post', '/goalkeepers/:userId/withdrawals/:withdrawalId/reversal', {
    permission: 'goalkeepers.penalties.reverse',
    audit: { action: 'penalty.reverse', resourceType: 'withdrawal', resourceId: (req) => String(req.params.withdrawalId) },
  }, async (req, res) => {
    const parsed = reverseWithdrawalRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new ApiError(400, 'validation_failed', 'One or more fields are missing or invalid.', zodFieldErrors(parsed.error));
    }
    const { refund, liftSuspension, reason } = parsed.data;
    const result = await deps.mediator.send(
      new ReverseWithdrawalPenaltyCommand(req.adminAccess!.userId, req.params.userId, req.params.withdrawalId, refund, liftSuspension, reason),
    );

    // Exhaustive on purpose: adding an outcome without mapping it here fails compilation.
    switch (result.outcome) {
      case 'reversed':
      case 'replayed':
        if (result.outcome === 'replayed') res.locals.auditOutcome = 'replayed';
        res.status(200).json({ withdrawal: result.withdrawal, suspendedUntil: result.suspendedUntil });
        return;
      case 'invalid_request':
        throw new ApiError(400, 'validation_failed', 'One or more fields are missing or invalid.', result.errors);
      case 'not_a_goalkeeper':
        throw goalkeeperNotFound();
      case 'withdrawal_not_found':
        throw new ApiError(404, 'withdrawal_not_found', 'This withdrawal does not exist for this goalkeeper.');
      case 'operating_balance_not_configured':
        throw operatingBalanceNotConfigured(result.marketId);
      case 'missing_charge':
        throw new ApiError(409, 'missing_charge', 'This booking has no commission charge to refund.', undefined, { bookingId: result.bookingId });
    }
  });

  // VAT per country (feature 023): charged on top of commissions and penalties.
  route('get', '/tax-settings/:countryId', 'pricing.read', async (req, res) => {
    const result = await deps.mediator.send(new GetTaxSettingsQuery(req.params.countryId));
    switch (result.outcome) {
      case 'success':
        res.status(200).json(result.settings);
        return;
      case 'not_found':
        throw new ApiError(404, 'settings_not_found', 'No VAT rate is configured for this country (0 % applies).');
    }
  });

  route('put', '/tax-settings/:countryId', {
    permission: 'pricing.manage',
    audit: {
      action: 'taxSettings.update',
      resourceType: 'taxSettings',
      resourceId: (req) => String(req.params.countryId),
      before: (req) => settingsBefore(deps.mediator.send(new GetTaxSettingsQuery(String(req.params.countryId)))),
    },
  }, async (req, res) => {
    const parsed = taxSettingsRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new ApiError(400, 'validation_failed', 'One or more fields are missing or invalid.', zodFieldErrors(parsed.error));
    }
    const result = await deps.mediator.send(new SetTaxSettingsCommand(req.adminAccess!.userId, req.params.countryId, parsed.data.vatRateBps));
    switch (result.outcome) {
      case 'saved':
        res.status(200).json(result.settings);
        return;
      case 'country_not_found':
        throw new ApiError(404, 'country_not_found', 'No country exists with this id.');
      case 'invalid':
        throw new ApiError(400, 'validation_failed', 'One or more fields are missing or invalid.', result.fieldErrors);
    }
  });

  return router;
}
