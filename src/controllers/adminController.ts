import { Router } from 'express';
import type { ISender } from '../application/common/mediator/types.js';
import type { AccessTokenClaims } from '../application/features/auth/common/accessTokenClaims.js';
import { RecordWalletAdjustmentCommand } from '../application/features/wallet/commands/recordWalletAdjustment/recordWalletAdjustmentCommand.js';
import { requireAdmin } from '../infrastructure/auth/middleware/requireAdmin.js';
import { requireAuth } from '../infrastructure/auth/middleware/requireAuth.js';
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

export interface AdminControllerDependencies {
  mediator: ISender;
  verifyAccessToken: (token: string) => Promise<AccessTokenClaims | null>;
}

/**
 * Administration endpoints (no interface yet — a future admin app only needs screens). Every
 * route requires an administrator's token. Starts with the goalkeeper wallets (feature 011).
 */
export function createAdminController(deps: AdminControllerDependencies): Router {
  const router = Router();

  router.use(requireAuth(deps.verifyAccessToken), requireAdmin());

  router.get('/goalkeepers/:userId/wallet', async (req, res) => {
    await sendWallet(deps.mediator, req.params.userId, res, { goalkeeperId: req.params.userId });
  });

  router.get('/goalkeepers/:userId/wallet/movements', async (req, res) => {
    await sendMovements(deps.mediator, req.params.userId, 'admin', req, res);
  });

  router.post('/goalkeepers/:userId/wallet/adjustments', async (req, res) => {
    const parsed = recordWalletAdjustmentRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new ApiError(400, 'validation_failed', 'One or more fields are missing or invalid.', zodFieldErrors(parsed.error));
    }
    const { amount, reason, operationKey } = parsed.data;
    const result = await deps.mediator.send(
      new RecordWalletAdjustmentCommand(req.authClaims!.sub, req.params.userId, amount, reason, operationKey),
    );

    // Exhaustive on purpose: adding an outcome without mapping it here fails compilation.
    switch (result.outcome) {
      case 'recorded':
        res.status(201).json({ ...result.movement, balance: result.balance });
        return;
      case 'replayed':
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
  router.get('/goalkeepers/:userId/withdrawals', async (req, res) => {
    await sendWithdrawals(deps.mediator, req.params.userId, 'admin', req, res);
  });

  router.post('/goalkeepers/:userId/withdrawals/:withdrawalId/reversal', async (req, res) => {
    const parsed = reverseWithdrawalRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new ApiError(400, 'validation_failed', 'One or more fields are missing or invalid.', zodFieldErrors(parsed.error));
    }
    const { refund, liftSuspension, reason } = parsed.data;
    const result = await deps.mediator.send(
      new ReverseWithdrawalPenaltyCommand(req.authClaims!.sub, req.params.userId, req.params.withdrawalId, refund, liftSuspension, reason),
    );

    // Exhaustive on purpose: adding an outcome without mapping it here fails compilation.
    switch (result.outcome) {
      case 'reversed':
      case 'replayed':
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
  router.get('/cases', async (req, res) => {
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

  router.get('/cases/:caseId', async (req, res) => {
    const result = await deps.mediator.send(new GetCaseQuery(req.params.caseId));
    switch (result.outcome) {
      case 'ok':
        res.status(200).json(result.case);
        return;
      case 'case_not_found':
        throw new ApiError(404, 'case_not_found', 'This case does not exist.');
    }
  });

  router.post('/cases/:caseId/resolve', async (req, res) => {
    const parsed = resolveCaseRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new ApiError(400, 'validation_failed', 'One or more fields are missing or invalid.', zodFieldErrors(parsed.error));
    }
    const result = await deps.mediator.send(new ResolveCaseCommand(req.authClaims!.sub, req.params.caseId, parsed.data.note));

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

  return router;
}
