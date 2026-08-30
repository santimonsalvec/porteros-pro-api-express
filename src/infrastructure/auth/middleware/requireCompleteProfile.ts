import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Express equivalent of the source's `CompleteProfile` authorization policy: succeeds
 * when `profileComplete === "true"`; any other value is rejected with `403` and no
 * body. Never applied to the SSO exchange/refresh or profile-completion endpoints
 * themselves — completing the profile must remain reachable while it's incomplete.
 */
export function requireCompleteProfile(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.authClaims?.profileComplete !== 'true') {
      res.status(403).end();
      return;
    }
    next();
  };
}
