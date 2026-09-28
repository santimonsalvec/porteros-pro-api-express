import type { Request, Response } from 'express';
import type { ISender } from '../../application/common/mediator/types.js';
import { GetGoalkeeperWalletQuery } from '../../application/features/wallet/queries/getGoalkeeperWallet/getGoalkeeperWalletQuery.js';
import {
  ListWalletMovementsQuery,
  type WalletAudience,
} from '../../application/features/wallet/queries/listWalletMovements/listWalletMovementsQuery.js';
import { logger } from '../../infrastructure/observability/logger.js';
import { ApiError } from '../apiError.js';
import { listClientBookingsRequestSchema } from '../requests/goalkeeperRequests/listClientBookingsRequest.js';
import { zodFieldErrors } from '../requests/goalkeeperRequests/getServiceQuoteRequest.js';

/**
 * The wallet reads shared by the goalkeeper's own routes and the administration routes, so both
 * answer identically (contracts/goalkeeper-wallet.md, contracts/admin-wallet.md).
 */

export function goalkeeperNotFound(): ApiError {
  return new ApiError(404, 'goalkeeper_not_found', 'No active goalkeeper exists for this user.');
}

/** The currency of the goalkeeper's country cannot be resolved: logged so operations fix it. */
export function walletNotConfigured(cityId: string): ApiError {
  logger.warn({ outcome: 'wallet_not_configured', cityId }, 'Wallet refused: country or currency not configured');
  return new ApiError(422, 'wallet_not_configured', 'The wallet currency for this goalkeeper is not configured.');
}

export async function sendWallet(
  mediator: ISender,
  goalkeeperId: string,
  res: Response,
  extra: Record<string, unknown> = {},
): Promise<void> {
  const result = await mediator.send(new GetGoalkeeperWalletQuery(goalkeeperId));
  switch (result.outcome) {
    case 'success':
      if (result.unconfiguredZoneIds.length > 0) {
        // Those zones are never offered until a commission is configured (FR-010).
        logger.warn({ outcome: 'commission_not_configured', zoneIds: result.unconfiguredZoneIds }, 'Zones without a commission');
      }
      res.status(200).json({ ...extra, ...result.wallet });
      return;
    case 'not_a_goalkeeper':
      throw goalkeeperNotFound();
    case 'wallet_not_configured':
      throw walletNotConfigured(result.cityId);
  }
}

export async function sendMovements(
  mediator: ISender,
  goalkeeperId: string,
  audience: WalletAudience,
  req: Request,
  res: Response,
): Promise<void> {
  const parsed = listClientBookingsRequestSchema.safeParse(req.query);
  if (!parsed.success) {
    throw new ApiError(400, 'validation_failed', 'One or more fields are missing or invalid.', zodFieldErrors(parsed.error));
  }
  const result = await mediator.send(new ListWalletMovementsQuery(goalkeeperId, parsed.data.page, parsed.data.pageSize, audience));
  switch (result.outcome) {
    case 'success':
      res.status(200).json({
        items: result.items,
        page: result.page,
        pageSize: result.pageSize,
        totalItems: result.totalItems,
        totalPages: result.totalPages,
      });
      return;
    case 'not_a_goalkeeper':
      throw goalkeeperNotFound();
  }
}
