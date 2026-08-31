import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { ApiError } from './apiError.js';
import { logger } from '../infrastructure/observability/logger.js';

/**
 * Centralized error-handling middleware. Every thrown ApiError becomes its declared
 * structured response; anything else becomes a generic 500 with no internal detail
 * (no stack trace, driver message, or configuration value) — FR-044.
 */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'validation_failed', message: 'One or more fields are missing or invalid.' });
    return;
  }

  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      error: err.code,
      message: err.message,
      ...(err.fieldErrors ? { fieldErrors: err.fieldErrors } : {}),
      ...(err.extra ?? {}),
    });
    return;
  }

  logger.error({ err }, 'Unhandled error');
  res.status(500).json({ error: 'internal_error', message: 'An unexpected error occurred.' });
};
