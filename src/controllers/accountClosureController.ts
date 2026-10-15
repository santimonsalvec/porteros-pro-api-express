import { Router } from 'express';
import type { ISender } from '../application/common/mediator/types.js';
import type { AccessTokenClaims } from '../application/features/auth/common/accessTokenClaims.js';
import { CancelAccountClosureCommand } from '../application/features/accountClosures/commands/cancelAccountClosure/cancelAccountClosureCommand.js';
import { RequestAccountClosureCommand } from '../application/features/accountClosures/commands/requestAccountClosure/requestAccountClosureCommand.js';
import { GetMyAccountClosureQuery } from '../application/features/accountClosures/queries/getMyAccountClosure/getMyAccountClosureQuery.js';
import { requireAuth } from '../infrastructure/auth/middleware/requireAuth.js';
import { ApiError } from './apiError.js';

export interface AccountClosureControllerDependencies {
  mediator: ISender;
  verifyAccessToken: (token: string) => Promise<AccessTokenClaims | null>;
}

/**
 * The user's own closure request, `/profile/account-closure` (feature 029, contracts/account-closure-api.md).
 * Any signed-in user: a profile that is not complete yet does not stop anyone from leaving.
 */
export function createAccountClosureController(deps: AccountClosureControllerDependencies): Router {
  const router = Router();
  router.use(requireAuth(deps.verifyAccessToken));

  router.get('/', async (req, res) => {
    const result = await deps.mediator.send(new GetMyAccountClosureQuery(req.authClaims!.sub));
    res.status(200).json({ current: result.current, preview: result.preview });
  });

  router.post('/', async (req, res) => {
    const result = await deps.mediator.send(new RequestAccountClosureCommand(req.authClaims!.sub));
    // Exhaustive on purpose: adding an outcome without mapping it here fails compilation.
    switch (result.outcome) {
      case 'requested':
        res.status(201).json({ current: result.current });
        return;
      case 'blocked':
        throw new ApiError(409, 'closure_blocked', 'You have accepted matches to play; play or withdraw from them first.', undefined, {
          blockers: result.blockers,
        });
      case 'already_open':
        throw new ApiError(409, 'closure_already_open', 'You already asked to close your account.', undefined, { current: result.current });
    }
  });

  router.post('/cancel', async (req, res) => {
    const result = await deps.mediator.send(new CancelAccountClosureCommand(req.authClaims!.sub));
    switch (result.outcome) {
      case 'cancelled':
        res.status(200).json({ current: result.current });
        return;
      case 'not_found':
        throw new ApiError(404, 'closure_not_found', 'There is no open closure request.');
      case 'not_cancellable':
        throw new ApiError(409, 'closure_not_cancellable', 'The refund was already recorded; it can no longer be cancelled.');
    }
  });

  return router;
}
