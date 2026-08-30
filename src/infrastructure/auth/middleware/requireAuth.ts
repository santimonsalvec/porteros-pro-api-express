import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { AccessTokenClaims } from '../../../application/features/auth/common/accessTokenClaims.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      authClaims?: AccessTokenClaims;
    }
  }
}

/**
 * Express equivalent of the source's `[Authorize]`: verifies the bearer JWT and
 * attaches its claims to the request for downstream middleware/handlers. Missing or
 * invalid token → 401 with no body (matches the standard ASP.NET Core challenge).
 */
export function requireAuth(
  verifyAccessToken: (token: string) => Promise<AccessTokenClaims | null>,
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const header = req.header('authorization');
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
    if (!token) {
      res.status(401).end();
      return;
    }

    const claims = await verifyAccessToken(token);
    if (!claims) {
      res.status(401).end();
      return;
    }

    req.authClaims = claims;
    next();
  };
}
