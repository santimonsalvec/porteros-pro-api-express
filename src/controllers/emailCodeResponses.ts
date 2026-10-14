import type { Request, Response } from 'express';
import type { ZodSchema } from 'zod';
import type { RequestLoginCodeResult } from '../application/features/auth/common/requestLoginCode.js';
import type { VerificationFailure } from '../domain/auth/loginCode.js';
import { ApiError } from './apiError.js';
import { zodFieldErrors } from './requests/goalkeeperRequests/getServiceQuoteRequest.js';

/** The body of a sign-in code route, or `validation_failed` with the fields (admin spec 009). */
export function parseEmailCodeBody<T>(schema: ZodSchema<T>, req: Request): T {
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) throw new ApiError(400, 'validation_failed', 'One or more fields are missing or invalid.', zodFieldErrors(parsed.error));
  return parsed.data;
}

function tooMany(res: Response, code: string, message: string, retryAfterSeconds: number, extra: Record<string, unknown> = {}): ApiError {
  res.setHeader('Retry-After', String(retryAfterSeconds));
  return new ApiError(429, code, message, undefined, { retryAfterSeconds, ...extra });
}

/**
 * A code request's answer, the same for the app and the admin web (contracts/email-code-api.md):
 * 202 with when it expires and when another can be asked, or the reason it was not sent.
 */
export function answerCodeRequest(res: Response, result: RequestLoginCodeResult): void {
  switch (result.outcome) {
    case 'sent':
      res.status(202).json({ email: result.email, expiresAt: result.expiresAt, expiryMinutes: result.expiryMinutes, resendAfterSeconds: result.resendAfterSeconds });
      return;
    case 'invalid_email':
      throw new ApiError(400, 'validation_failed', 'One or more fields are missing or invalid.', { email: 'email must be a valid email address' });
    case 'resend_too_soon':
      throw tooMany(res, 'resend_too_soon', 'Wait before asking for another code.', result.retryAfterSeconds);
    case 'too_many_codes':
      throw tooMany(res, 'too_many_codes', 'Too many codes for this address; try again later.', result.retryAfterSeconds, { retryAt: result.retryAt });
    case 'too_many_requests':
      throw tooMany(res, 'too_many_requests', 'Too many requests from this network; try again later.', result.retryAfterSeconds);
    case 'delivery_failed':
      throw new ApiError(503, 'email_delivery_failed', 'The code could not be sent; try again.');
  }
}

/** Why a code was not accepted: never whether the address has an account or access (FR-012). */
export function codeRefusal(res: Response, result: { outcome: VerificationFailure } | { outcome: 'too_many_requests'; retryAfterSeconds: number }): ApiError {
  switch (result.outcome) {
    case 'invalid_code':
      return new ApiError(401, 'invalid_code', 'The code is not correct.');
    case 'code_expired':
      return new ApiError(401, 'code_expired', 'The code expired; ask for a new one.');
    case 'too_many_attempts':
      return new ApiError(401, 'too_many_attempts', 'Too many attempts; ask for a new code.');
    case 'too_many_requests':
      return tooMany(res, 'too_many_requests', 'Too many requests from this network; try again later.', result.retryAfterSeconds);
  }
}
