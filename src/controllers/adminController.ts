import { Router } from 'express';
import { createAdminRouting, settingsBefore } from './admin/adminRoute.js';
import { registerTeamRoutes } from './admin/teamRoutes.js';
import type { ISender } from '../application/common/mediator/types.js';
import { RecordWalletAdjustmentCommand } from '../application/features/wallet/commands/recordWalletAdjustment/recordWalletAdjustmentCommand.js';
import type { AdminWebDependencies } from '../appDependencies.js';
import { requireAdminAuth } from '../infrastructure/auth/middleware/requireAdminAuth.js';
import { adminCors } from '../infrastructure/http/adminCors.js';
import { GetAdminMeQuery } from '../application/features/staff/queries/getAdminMe/getAdminMeQuery.js';
import { GetPermissionCatalogQuery } from '../application/features/staff/queries/getPermissionCatalog/getPermissionCatalogQuery.js';
import { GetGoalkeeperWalletQuery } from '../application/features/wallet/queries/getGoalkeeperWallet/getGoalkeeperWalletQuery.js';
import { ApiError } from './apiError.js';
import { zodFieldErrors } from './requests/goalkeeperRequests/getServiceQuoteRequest.js';
import { recordWalletAdjustmentRequestSchema } from './requests/wallet/recordWalletAdjustmentRequest.js';
import { goalkeeperNotFound, sendMovements, sendWallet, walletNotConfigured } from './wallet/walletHttp.js';
import { ReverseWithdrawalPenaltyCommand } from '../application/features/bookingLifecycle/commands/reverseWithdrawalPenalty/reverseWithdrawalPenaltyCommand.js';
import { reverseWithdrawalRequestSchema } from './requests/withdrawals/reverseWithdrawalRequest.js';
import { sendWithdrawals } from './withdrawals/withdrawalsHttp.js';
import { ListCasesQuery } from '../application/features/cases/queries/listCases/listCasesQuery.js';
import { GetCaseQuery } from '../application/features/cases/queries/getCase/getCaseQuery.js';
import { ResolveCaseCommand } from '../application/features/cases/commands/resolveCase/resolveCaseCommand.js';
import { listCasesQuerySchema, resolveCaseRequestSchema } from './requests/cases/caseRequests.js';
import { SetGatewaySettingsCommand } from '../application/features/payments/commands/setGatewaySettings/setGatewaySettingsCommand.js';
import { GetGatewaySettingsQuery } from '../application/features/payments/queries/getGatewaySettings/getGatewaySettingsQuery.js';
import { gatewaySettingsRequestSchema } from './requests/payments/gatewaySettingsRequest.js';
import { SetTaxSettingsCommand } from '../application/features/invoicing/commands/setTaxSettings/setTaxSettingsCommand.js';
import { GetTaxSettingsQuery } from '../application/features/invoicing/queries/getTaxSettings/getTaxSettingsQuery.js';
import { SetInvoicingSettingsCommand } from '../application/features/invoicing/commands/setInvoicingSettings/setInvoicingSettingsCommand.js';
import { GetInvoicingSettingsQuery } from '../application/features/invoicing/queries/getInvoicingSettings/getInvoicingSettingsQuery.js';
import { ListDocumentsForAdminQuery } from '../application/features/invoicing/queries/listDocumentsForAdmin/listDocumentsForAdminQuery.js';
import { RetryDocumentCommand } from '../application/features/invoicing/commands/retryDocument/retryDocumentCommand.js';
import { invoicingSettingsRequestSchema, listDocumentsQuerySchema, taxSettingsRequestSchema } from './requests/invoicing/invoicingRequests.js';

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

  const { route } = createAdminRouting(router, deps.admin);
  registerTeamRoutes(route, deps.mediator);

  // The fixed permission catalog, for the role screen (any active member).
  router.get('/permissions', async (_req, res) => {
    res.status(200).json(await deps.mediator.send(new GetPermissionCatalogQuery()));
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

  route('get', '/goalkeepers/:userId/wallet', 'wallets.read', async (req, res) => {
    await sendWallet(deps.mediator, req.params.userId, res, { goalkeeperId: req.params.userId });
  });

  route('get', '/goalkeepers/:userId/wallet/movements', 'wallets.read', async (req, res) => {
    await sendMovements(deps.mediator, req.params.userId, 'admin', req, res);
  });

  route('post', '/goalkeepers/:userId/wallet/adjustments', {
    permission: 'wallets.adjust',
    audit: {
      action: 'wallet.adjust',
      resourceType: 'wallet',
      resourceId: (req) => String(req.params.userId),
      before: async (req) => {
        const result = await deps.mediator.send(new GetGoalkeeperWalletQuery(String(req.params.userId)));
        return result.outcome === 'success' ? result.wallet : null;
      },
    },
  }, async (req, res) => {
    const parsed = recordWalletAdjustmentRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new ApiError(400, 'validation_failed', 'One or more fields are missing or invalid.', zodFieldErrors(parsed.error));
    }
    const { amount, reason, operationKey } = parsed.data;
    const result = await deps.mediator.send(
      new RecordWalletAdjustmentCommand(req.adminAccess!.userId, req.params.userId, amount, reason, operationKey),
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
      case 'wallet_not_configured':
        throw walletNotConfigured(result.cityId);
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
      case 'wallet_not_configured':
        throw walletNotConfigured(result.cityId);
      case 'missing_charge':
        throw new ApiError(409, 'missing_charge', 'This booking has no commission charge to refund.', undefined, { bookingId: result.bookingId });
    }
  });

  // Cases for manual review (feature 021).
  route('get', '/cases', 'cases.read', async (req, res) => {
    const parsed = listCasesQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new ApiError(400, 'validation_failed', 'One or more fields are missing or invalid.', zodFieldErrors(parsed.error));
    }
    const result = await deps.mediator.send(new ListCasesQuery(parsed.data.status ?? null, parsed.data.page, parsed.data.pageSize));
    res.status(200).json({
      items: result.items,
      page: result.page,
      pageSize: result.pageSize,
      totalItems: result.totalItems,
      totalPages: result.totalPages,
    });
  });

  route('get', '/cases/:caseId', 'cases.read', async (req, res) => {
    const result = await deps.mediator.send(new GetCaseQuery(req.params.caseId));
    switch (result.outcome) {
      case 'ok':
        res.status(200).json(result.case);
        return;
      case 'case_not_found':
        throw new ApiError(404, 'case_not_found', 'This case does not exist.');
    }
  });

  route('post', '/cases/:caseId/resolve', {
    permission: 'cases.resolve',
    audit: {
      action: 'case.resolve',
      resourceType: 'case',
      resourceId: (req) => String(req.params.caseId),
      before: async (req) => {
        const result = await deps.mediator.send(new GetCaseQuery(String(req.params.caseId)));
        return result.outcome === 'ok' ? result.case : null;
      },
    },
  }, async (req, res) => {
    const parsed = resolveCaseRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new ApiError(400, 'validation_failed', 'One or more fields are missing or invalid.', zodFieldErrors(parsed.error));
    }
    const result = await deps.mediator.send(new ResolveCaseCommand(req.adminAccess!.userId, req.params.caseId, parsed.data.note));

    // Exhaustive on purpose: adding an outcome without mapping it here fails compilation.
    switch (result.outcome) {
      case 'resolved':
        res.status(200).json(result.case);
        return;
      case 'case_not_found':
        throw new ApiError(404, 'case_not_found', 'This case does not exist.');
      case 'case_already_resolved':
        throw new ApiError(409, 'case_already_resolved', 'This case is already resolved.');
      case 'invalid_note':
        throw new ApiError(400, 'validation_failed', 'One or more fields are missing or invalid.', { note: result.message });
    }
  });

  // Each country's top-up gateway (feature 022). Secrets are never here: they live in Secret Manager.
  route('get', '/payment-gateways/:countryId', 'payments.settings.manage', async (req, res) => {
    const result = await deps.mediator.send(new GetGatewaySettingsQuery(req.params.countryId));
    switch (result.outcome) {
      case 'success':
        res.status(200).json(result.settings);
        return;
      case 'not_found':
        throw new ApiError(404, 'settings_not_found', 'No payment gateway is configured for this country.');
    }
  });

  route('put', '/payment-gateways/:countryId', {
    permission: 'payments.settings.manage',
    audit: {
      action: 'paymentGatewaySettings.update',
      resourceType: 'paymentGatewaySettings',
      resourceId: (req) => String(req.params.countryId),
      before: (req) => settingsBefore(deps.mediator.send(new GetGatewaySettingsQuery(String(req.params.countryId)))),
    },
  }, async (req, res) => {
    const parsed = gatewaySettingsRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new ApiError(400, 'validation_failed', 'One or more fields are missing or invalid.', zodFieldErrors(parsed.error));
    }
    const { gateway, publicConfig, costs, amounts } = parsed.data;
    const result = await deps.mediator.send(
      new SetGatewaySettingsCommand(req.adminAccess!.userId, req.params.countryId, gateway, publicConfig, costs, amounts),
    );
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

  // The invoicing provider of each country (feature 023). Credentials live in Secret Manager.
  route('get', '/invoicing/settings/:countryId', 'invoicing.settings.manage', async (req, res) => {
    const result = await deps.mediator.send(new GetInvoicingSettingsQuery(req.params.countryId));
    switch (result.outcome) {
      case 'success':
        res.status(200).json(result.settings);
        return;
      case 'not_found':
        throw new ApiError(404, 'settings_not_found', 'No invoicing provider is configured for this country.');
    }
  });

  route('put', '/invoicing/settings/:countryId', {
    permission: 'invoicing.settings.manage',
    audit: {
      action: 'invoicingSettings.update',
      resourceType: 'invoicingSettings',
      resourceId: (req) => String(req.params.countryId),
      before: (req) => settingsBefore(deps.mediator.send(new GetInvoicingSettingsQuery(String(req.params.countryId)))),
    },
  }, async (req, res) => {
    const parsed = invoicingSettingsRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new ApiError(400, 'validation_failed', 'One or more fields are missing or invalid.', zodFieldErrors(parsed.error));
    }
    const result = await deps.mediator.send(
      new SetInvoicingSettingsCommand(req.adminAccess!.userId, req.params.countryId, parsed.data.provider, parsed.data.config),
    );
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

  route('get', '/invoicing/documents', 'invoicing.read', async (req, res) => {
    const parsed = listDocumentsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new ApiError(400, 'validation_failed', 'One or more fields are missing or invalid.', zodFieldErrors(parsed.error));
    }
    const result = await deps.mediator.send(new ListDocumentsForAdminQuery(parsed.data.status ?? null, parsed.data.page, parsed.data.pageSize));
    res.status(200).json(result);
  });

  route('post', '/invoicing/documents/:documentId/retry', {
    permission: 'invoicing.retry',
    audit: { action: 'invoicingDocument.retry', resourceType: 'invoicingDocument', resourceId: (req) => String(req.params.documentId) },
  }, async (req, res) => {
    const result = await deps.mediator.send(new RetryDocumentCommand(req.adminAccess!.userId, req.params.documentId));
    switch (result.outcome) {
      case 'retried':
        res.status(202).json(result.document);
        return;
      case 'not_found':
        throw new ApiError(404, 'invoicing_document_not_found', 'No invoicing document exists with this id.');
      case 'not_retryable':
        throw new ApiError(409, 'document_not_retryable', 'Only a rejected document can be retried.', undefined, { status: result.status });
    }
  });

  return router;
}
