import type { Request, Response } from 'express';
import type { ISender } from '../../application/common/mediator/types.js';
import type { WithdrawalView } from '../../application/features/bookingLifecycle/common/withdrawalResponses.js';
import { ListGoalkeeperWithdrawalsQuery } from '../../application/features/bookingLifecycle/queries/listGoalkeeperWithdrawals/listGoalkeeperWithdrawalsQuery.js';
import { ApiError } from '../apiError.js';
import { zodFieldErrors } from '../requests/goalkeeperRequests/getServiceQuoteRequest.js';
import { listClientBookingsRequestSchema } from '../requests/goalkeeperRequests/listClientBookingsRequest.js';
import { goalkeeperNotFound } from '../wallet/walletHttp.js';

/** A goalkeeper's withdrawals, for themselves or an administrator (contracts/withdrawals.md §2–§3). */
export async function sendWithdrawals(mediator: ISender, goalkeeperId: string, view: WithdrawalView, req: Request, res: Response): Promise<void> {
  const parsed = listClientBookingsRequestSchema.safeParse(req.query);
  if (!parsed.success) {
    throw new ApiError(400, 'validation_failed', 'One or more fields are missing or invalid.', zodFieldErrors(parsed.error));
  }
  const result = await mediator.send(new ListGoalkeeperWithdrawalsQuery(goalkeeperId, parsed.data.page, parsed.data.pageSize, view));
  switch (result.outcome) {
    case 'ok':
      res.status(200).json({
        items: result.items,
        page: result.page,
        pageSize: result.pageSize,
        totalItems: result.totalItems,
        totalPages: result.totalPages,
        suspendedUntil: result.suspendedUntil,
      });
      return;
    case 'not_a_goalkeeper':
      throw goalkeeperNotFound();
  }
}
