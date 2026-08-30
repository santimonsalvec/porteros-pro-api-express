import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Express equivalent of the source's `ClientOnly` authorization policy: succeeds when
 * `isAdmin === "false"`; any other value (or a missing claim, meaning `requireAuth`
 * didn't run first) is rejected with `403` and no body.
 */
export function requireClientOnly(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.authClaims?.isAdmin !== 'false') {
      res.status(403).end();
      return;
    }
    next();
  };
}
