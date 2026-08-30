export interface ErrorResponse {
  error: string;
  message: string;
}

export interface ValidationErrorResponse extends ErrorResponse {
  fieldErrors: Record<string, string>;
}
