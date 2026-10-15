import type { Request, Response } from 'express';
import type { ISender } from '../../application/common/mediator/types.js';
import { StartDepositCommand } from '../../application/features/deposits/commands/startDeposit/startDepositCommand.js';
import { GetDepositQuery } from '../../application/features/deposits/queries/getDeposit/getDepositQuery.js';
import { ListDepositsQuery } from '../../application/features/deposits/queries/listDeposits/listDepositsQuery.js';
import { GetDepositOptionsQuery } from '../../application/features/deposits/queries/getDepositOptions/getDepositOptionsQuery.js';
import { ApiError } from '../apiError.js';
import { zodFieldErrors } from '../requests/goalkeeperRequests/getServiceQuoteRequest.js';
import { listClientBookingsRequestSchema } from '../requests/goalkeeperRequests/listClientBookingsRequest.js';
import { startDepositRequestSchema } from '../requests/deposits/startDepositRequest.js';
import { goalkeeperNotFound, operatingBalanceNotConfigured } from '../operatingBalance/operatingBalanceHttp.js';

/** The goalkeeper's deposit routes (feature 022, contracts/deposits.md). */

export async function sendDepositOptions(mediator: ISender, goalkeeperId: string, res: Response): Promise<void> {
  const result = await mediator.send(new GetDepositOptionsQuery(goalkeeperId));
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
    case 'operating_balance_not_configured':
      throw operatingBalanceNotConfigured(result.cityId);
  }
}

export async function startDeposit(mediator: ISender, goalkeeperId: string, req: Request, res: Response): Promise<void> {
  const parsed = startDepositRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, 'validation_failed', 'One or more fields are missing or invalid.', zodFieldErrors(parsed.error));
  }
  const result = await mediator.send(new StartDepositCommand(goalkeeperId, parsed.data.amount));
  switch (result.outcome) {
    case 'started':
      res.status(201).json({ ...result.deposit, checkoutUrl: result.checkoutUrl });
      return;
    case 'not_a_goalkeeper':
      throw goalkeeperNotFound();
    case 'operating_balance_not_configured':
      throw operatingBalanceNotConfigured(result.cityId);
    case 'invalid_amount':
      throw new ApiError(400, 'invalid_amount', 'The amount is not one of the available deposit amounts.', undefined, {
        amounts: result.amounts,
      });
    case 'terms_not_accepted':
      throw new ApiError(409, 'terms_not_accepted', 'The current terms and conditions must be accepted first.', undefined, {
        termsVersion: result.termsVersion,
      });
    case 'deposits_unavailable':
      throw new ApiError(409, 'deposits_unavailable', 'Deposits are not available in this country yet.');
    case 'gateway_unavailable':
      throw new ApiError(503, 'gateway_unavailable', 'The payment gateway is not available right now.');
  }
}

export async function sendDeposits(mediator: ISender, goalkeeperId: string, req: Request, res: Response): Promise<void> {
  const parsed = listClientBookingsRequestSchema.safeParse(req.query);
  if (!parsed.success) {
    throw new ApiError(400, 'validation_failed', 'One or more fields are missing or invalid.', zodFieldErrors(parsed.error));
  }
  const result = await mediator.send(new ListDepositsQuery(goalkeeperId, parsed.data.page, parsed.data.pageSize));
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

export async function sendDeposit(mediator: ISender, goalkeeperId: string, depositId: string, res: Response): Promise<void> {
  const result = await mediator.send(new GetDepositQuery(goalkeeperId, depositId));
  switch (result.outcome) {
    case 'success':
      res.status(200).json(result.deposit);
      return;
    case 'not_found':
      throw new ApiError(404, 'deposit_not_found', 'No deposit with this id exists for this goalkeeper.');
  }
}
