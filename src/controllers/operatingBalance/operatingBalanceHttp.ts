import type { Request, Response } from 'express';
import type { ISender } from '../../application/common/mediator/types.js';
import { GetGoalkeeperOperatingBalanceQuery } from '../../application/features/operatingBalance/queries/getGoalkeeperOperatingBalance/getGoalkeeperOperatingBalanceQuery.js';
import {
  ListBalanceMovementsQuery,
  type OperatingBalanceAudience,
} from '../../application/features/operatingBalance/queries/listBalanceMovements/listBalanceMovementsQuery.js';
import { logger } from '../../infrastructure/observability/logger.js';
import { ApiError } from '../apiError.js';
import { listClientBookingsRequestSchema } from '../requests/goalkeeperRequests/listClientBookingsRequest.js';
import { zodFieldErrors } from '../requests/goalkeeperRequests/getServiceQuoteRequest.js';

/**
 * The operating balance reads shared by the goalkeeper's own routes and the administration routes, so both
 * answer identically (contracts/goalkeeper-operating balance.md, contracts/admin-operating balance.md).
 */

export function goalkeeperNotFound(): ApiError {
  return new ApiError(404, 'goalkeeper_not_found', 'No active goalkeeper exists for this user.');
}

/** The currency of the goalkeeper's country cannot be resolved: logged so operations fix it. */
export function operatingBalanceNotConfigured(cityId: string): ApiError {
  logger.warn({ outcome: 'operating_balance_not_configured', cityId }, 'OperatingBalance refused: country or currency not configured');
  return new ApiError(422, 'operating_balance_not_configured', 'The operating balance currency for this goalkeeper is not configured.');
}

export async function sendOperatingBalance(
  mediator: ISender,
  goalkeeperId: string,
  res: Response,
  extra: Record<string, unknown> = {},
): Promise<void> {
  const result = await mediator.send(new GetGoalkeeperOperatingBalanceQuery(goalkeeperId));
  switch (result.outcome) {
    case 'success':
      if (result.unconfiguredZoneIds.length > 0) {
        // Those zones are never offered until a commission is configured (FR-010).
        logger.warn({ outcome: 'commission_not_configured', zoneIds: result.unconfiguredZoneIds }, 'Zones without a commission');
      }
      res.status(200).json({ ...extra, ...result.operatingBalance });
      return;
    case 'not_a_goalkeeper':
      throw goalkeeperNotFound();
    case 'operating_balance_not_configured':
      throw operatingBalanceNotConfigured(result.cityId);
  }
}

export async function sendMovements(
  mediator: ISender,
  goalkeeperId: string,
  audience: OperatingBalanceAudience,
  req: Request,
  res: Response,
): Promise<void> {
  const parsed = listClientBookingsRequestSchema.safeParse(req.query);
  if (!parsed.success) {
    throw new ApiError(400, 'validation_failed', 'One or more fields are missing or invalid.', zodFieldErrors(parsed.error));
  }
  const result = await mediator.send(new ListBalanceMovementsQuery(goalkeeperId, parsed.data.page, parsed.data.pageSize, audience));
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
