import type { NextFunction, Request, RequestHandler, Response } from 'express';

export interface AdminCorsOptions {
  /** Exact origins of the admin web (`ADMIN_ALLOWED_ORIGINS`); empty = none. */
  allowedOrigins: readonly string[];
  /** Only the session routes need the cookie. */
  credentials?: boolean;
}

/**
 * CORS for the admin web's routes only (`/admin`, `/auth/admin`), with the minimal methods and
 * headers (research §8); the app's routes never get CORS headers. A disallowed origin simply gets
 * none, and the browser blocks the call.
 */
export function adminCors(options: AdminCorsOptions): RequestHandler {
  const allowed = new Set(options.allowedOrigins);
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.header('origin');
    if (!origin || !allowed.has(origin)) {
      next();
      return;
    }
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.append('Vary', 'Origin');
    if (options.credentials) res.setHeader('Access-Control-Allow-Credentials', 'true');
    if (req.method !== 'OPTIONS') {
      next();
      return;
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Requested-With');
    res.setHeader('Access-Control-Max-Age', '600');
    res.status(204).end();
  };
}
