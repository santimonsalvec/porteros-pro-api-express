import { Router } from 'express';
import type { ISender } from '../application/common/mediator/types.js';
import type { AccessTokenClaims } from '../application/features/auth/common/accessTokenClaims.js';
import { ListEnabledMarketsQuery } from '../application/features/markets/queries/listEnabledMarkets/listEnabledMarketsQuery.js';
import { requireAuth } from '../infrastructure/auth/middleware/requireAuth.js';

export interface MarketsControllerDependencies {
  mediator: ISender;
  verifyAccessToken: (token: string) => Promise<AccessTokenClaims | null>;
}

/** `GET /markets`: the enabled markets, for any signed-in user (spec 031, contract A1). */
export function createMarketsController(deps: MarketsControllerDependencies): Router {
  const router = Router();

  router.get('/', requireAuth(deps.verifyAccessToken), async (_req, res) => {
    res.status(200).json(await deps.mediator.send(new ListEnabledMarketsQuery()));
  });

  return router;
}
