import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../../controllers/apiError.js';

/** What the admin web sends in `X-Requested-With` on every state-changing call of its own session. */
export const CSRF_HEADER_VALUE = 'porteros-admin';

/** Refuses a call without the admin web's header, so a cross-site form can never make it (admin spec 001). */
export function requireCsrfHeader(req: Request, _res: Response, next: NextFunction): void {
  if (req.header('x-requested-with') !== CSRF_HEADER_VALUE) {
    throw new ApiError(400, 'missing_csrf_header', 'This call needs the X-Requested-With header of the admin web.');
  }
  next();
}
