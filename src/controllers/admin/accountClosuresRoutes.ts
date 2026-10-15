import type { Request } from 'express';
import type { ISender } from '../../application/common/mediator/types.js';
import { CloseAccountCommand } from '../../application/features/accountClosures/commands/closeAccount/closeAccountCommand.js';
import { RecordClosureRefundCommand } from '../../application/features/accountClosures/commands/recordClosureRefund/recordClosureRefundCommand.js';
import { RejectAccountClosureCommand } from '../../application/features/accountClosures/commands/rejectAccountClosure/rejectAccountClosureCommand.js';
import { ResolveClosureDebtCommand } from '../../application/features/accountClosures/commands/resolveClosureDebt/resolveClosureDebtCommand.js';
import type { ClosureActionOutcome } from '../../application/features/accountClosures/common/closureAdminResults.js';
import { GetAccountClosureAdminQuery } from '../../application/features/accountClosures/queries/getAccountClosureAdmin/getAccountClosureAdminQuery.js';
import { ListAccountClosuresAdminQuery } from '../../application/features/accountClosures/queries/listAccountClosuresAdmin/listAccountClosuresAdminQuery.js';
import { ApiError } from '../apiError.js';
import {
  debtResolutionRequestSchema,
  listAccountClosuresQuerySchema,
  recordRefundRequestSchema,
  rejectClosureRequestSchema,
} from '../requests/accountClosures/accountClosureRequests.js';
import { conflict, invalidFields, notFound, parse, type Route } from './geographyRoutes.js';

const closureIdOf = (req: Request) => String(req.params.closureId);
const closureNotFound = () => notFound('closure_not_found');
const invalidTransition = () => conflict('invalid_transition', 'This action is not possible in the current state of the request.');

/**
 * Account closures in the admin web (feature 029, contracts/account-closure-api.md): read with
 * `account_closures.read`, resolved with `account_closures.manage`. Every write is audited, with the
 * request's state before it.
 */
export function registerAccountClosureRoutes(route: Route, mediator: ISender): void {
  route('get', '/account-closures', 'account_closures.read', async (req, res) => {
    const query = parse(listAccountClosuresQuerySchema, req.query);
    const result = await mediator.send(
      new ListAccountClosuresAdminQuery({ statuses: query.status, q: query.q ?? null, debt: query.hasDebt, page: query.page, pageSize: query.pageSize }),
    );
    res.status(200).json(result.page);
  });

  route('get', '/account-closures/:closureId', 'account_closures.read', async (req, res) => {
    const result = await mediator.send(new GetAccountClosureAdminQuery(closureIdOf(req)));
    if (result.outcome === 'not_found') throw closureNotFound();
    res.status(200).json(result.detail);
  });

  const before = async (req: Request) => {
    const result = await mediator.send(new GetAccountClosureAdminQuery(closureIdOf(req)));
    return result.outcome === 'ok' ? result.detail : null;
  };
  const audit = (action: string) => ({ action, resourceType: 'accountClosure', resourceId: closureIdOf, before });

  /** Maps what every action answers; `extra` takes the outcomes only that action has. */
  const answer = (res: Parameters<Parameters<Route>[3]>[1], result: ClosureActionOutcome): void => {
    switch (result.outcome) {
      case 'ok':
        res.status(200).json(result.detail);
        return;
      case 'replayed':
        res.locals.auditOutcome = 'replayed';
        res.status(200).json(result.detail);
        return;
      case 'not_found':
        throw closureNotFound();
      case 'invalid_transition':
        throw invalidTransition();
      case 'validation_failed':
        throw invalidFields(result.fieldErrors);
    }
  };

  route(
    'post',
    '/account-closures/:closureId/debt-resolution',
    { permission: 'account_closures.manage', audit: audit('account_closure.debt_resolve') },
    async (req, res) => {
      const body = parse(debtResolutionRequestSchema, req.body);
      const result = await mediator.send(new ResolveClosureDebtCommand(req.adminAccess!.userId, closureIdOf(req), body.resolution, body.reason ?? null));
      if (result.outcome === 'debt_not_applicable') throw conflict('debt_not_applicable', 'The balance is not negative: there is no debt to resolve.');
      answer(res, result);
    },
  );

  route(
    'post',
    '/account-closures/:closureId/refund',
    { permission: 'account_closures.manage', audit: audit('account_closure.refund') },
    async (req, res) => {
      const body = parse(recordRefundRequestSchema, req.body);
      const result = await mediator.send(
        new RecordClosureRefundCommand(req.adminAccess!.userId, closureIdOf(req), body.amount, body.reference ?? null, body.paidOn ?? null, body.note ?? null),
      );
      switch (result.outcome) {
        case 'refund_amount_mismatch':
          throw new ApiError(409, 'refund_amount_mismatch', 'The amount is not the balance.', undefined, { balance: result.balance });
        case 'debt_pending':
          throw new ApiError(409, 'debt_pending', 'The balance is negative: resolve the debt first.', undefined, { balance: result.balance });
        case 'closure_blockers_pending':
          throw new ApiError(409, 'closure_blockers_pending', 'Something still blocks the refund.', undefined, { blockers: result.blockers });
        default:
          answer(res, result);
      }
    },
  );

  route('post', '/account-closures/:closureId/close', { permission: 'account_closures.manage', audit: audit('account_closure.close') }, async (req, res) => {
    answer(res, await mediator.send(new CloseAccountCommand(req.adminAccess!.userId, closureIdOf(req))));
  });

  route('post', '/account-closures/:closureId/reject', { permission: 'account_closures.manage', audit: audit('account_closure.reject') }, async (req, res) => {
    const { reason } = parse(rejectClosureRequestSchema, req.body);
    answer(res, await mediator.send(new RejectAccountClosureCommand(req.adminAccess!.userId, closureIdOf(req), reason)));
  });
}
