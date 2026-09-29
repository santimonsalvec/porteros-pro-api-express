import type { Request, Response } from 'express';
import type { ISender } from '../../application/common/mediator/types.js';
import { StartTopUpCommand } from '../../application/features/payments/commands/startTopUp/startTopUpCommand.js';
import { GetTopUpQuery } from '../../application/features/payments/queries/getTopUp/getTopUpQuery.js';
import { ListTopUpsQuery } from '../../application/features/payments/queries/listTopUps/listTopUpsQuery.js';
import { GetTopUpOptionsQuery } from '../../application/features/payments/queries/getTopUpOptions/getTopUpOptionsQuery.js';
import { ApiError } from '../apiError.js';
import { zodFieldErrors } from '../requests/goalkeeperRequests/getServiceQuoteRequest.js';
import { listClientBookingsRequestSchema } from '../requests/goalkeeperRequests/listClientBookingsRequest.js';
import { startTopUpRequestSchema } from '../requests/payments/startTopUpRequest.js';
import { goalkeeperNotFound, walletNotConfigured } from '../wallet/walletHttp.js';

/** The goalkeeper's top-up routes (feature 022, contracts/top-ups.md). */

export async function sendTopUpOptions(mediator: ISender, goalkeeperId: string, res: Response): Promise<void> {
  const result = await mediator.send(new GetTopUpOptionsQuery(goalkeeperId));
  switch (result.outcome) {
    case 'ok':
      res.status(200).json({
        available: result.available,
        gateway: result.gateway,
        currency: result.currency,
        termsAccepted: result.termsAccepted,
        termsVersion: result.termsVersion,
        options: result.options,
      });
      return;
    case 'not_a_goalkeeper':
      throw goalkeeperNotFound();
    case 'wallet_not_configured':
      throw walletNotConfigured(result.cityId);
  }
}

export async function startTopUp(mediator: ISender, goalkeeperId: string, req: Request, res: Response): Promise<void> {
  const parsed = startTopUpRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, 'validation_failed', 'One or more fields are missing or invalid.', zodFieldErrors(parsed.error));
  }
  const result = await mediator.send(new StartTopUpCommand(goalkeeperId, parsed.data.amount));
  switch (result.outcome) {
    case 'started':
      res.status(201).json({ ...result.topUp, checkoutUrl: result.checkoutUrl });
      return;
    case 'not_a_goalkeeper':
      throw goalkeeperNotFound();
    case 'wallet_not_configured':
      throw walletNotConfigured(result.cityId);
    case 'invalid_amount':
      throw new ApiError(400, 'invalid_amount', 'The amount is not one of the available top-up amounts.', undefined, {
        amounts: result.amounts,
      });
    case 'terms_not_accepted':
      throw new ApiError(409, 'terms_not_accepted', 'The current terms and conditions must be accepted first.', undefined, {
        termsVersion: result.termsVersion,
      });
    case 'top_ups_unavailable':
      throw new ApiError(409, 'top_ups_unavailable', 'Top-ups are not available in this country yet.');
    case 'gateway_unavailable':
      throw new ApiError(503, 'gateway_unavailable', 'The payment gateway is not available right now.');
  }
}

export async function sendTopUps(mediator: ISender, goalkeeperId: string, req: Request, res: Response): Promise<void> {
  const parsed = listClientBookingsRequestSchema.safeParse(req.query);
  if (!parsed.success) {
    throw new ApiError(400, 'validation_failed', 'One or more fields are missing or invalid.', zodFieldErrors(parsed.error));
  }
  const result = await mediator.send(new ListTopUpsQuery(goalkeeperId, parsed.data.page, parsed.data.pageSize));
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

export async function sendTopUp(mediator: ISender, goalkeeperId: string, topUpId: string, res: Response): Promise<void> {
  const result = await mediator.send(new GetTopUpQuery(goalkeeperId, topUpId));
  switch (result.outcome) {
    case 'success':
      res.status(200).json(result.topUp);
      return;
    case 'not_found':
      throw new ApiError(404, 'top_up_not_found', 'No top-up with this id exists for this goalkeeper.');
  }
}
