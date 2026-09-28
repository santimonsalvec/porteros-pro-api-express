import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Administration routes: only a token whose `isAdmin` claim is exactly `"true"` passes (the
 * mirror of `requireClientOnly`). Anything else — a client, or no claims because `requireAuth`
 * did not run — is a 403 with no body.
 */
export function requireAdmin(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.authClaims?.isAdmin !== 'true') {
      res.status(403).end();
      return;
    }
    next();
  };
}
