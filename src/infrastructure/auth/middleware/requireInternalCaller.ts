import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Guards `/internal/*` (feature 013): only the platform's own Pub/Sub push identity and Cloud
 * Scheduler identity get through, proven by a Google OIDC token. App access tokens — even an
 * administrator's — are never accepted here. Refused calls get 401 and nothing runs.
 */
export function requireInternalCaller(verifyInternalCaller: (token: string) => Promise<boolean>): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const header = req.header('authorization');
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
    if (!token || !(await verifyInternalCaller(token))) {
      res.status(401).json({ error: 'unauthenticated', message: 'A valid platform identity token is required.' });
      return;
    }
    next();
  };
}
