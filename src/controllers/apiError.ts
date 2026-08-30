/**
 * A deliberate, structured HTTP failure. Every controller/route maps a handler's
 * outcome to one of these instead of letting the standard `Error` shape (which may
 * carry a stack trace or driver detail) reach a response body (FR-044).
 */
export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly fieldErrors?: Record<string, string>;

  constructor(statusCode: number, code: string, message: string, fieldErrors?: Record<string, string>) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}
