/**
 * One rule a pricing value breaks: where (`leadTimeSurcharge.tiers.2.toMinutes`), a stable code the
 * admin web translates, and an English message for logs and configuration errors.
 */
export interface ConfigIssue {
  path: string;
  code: string;
  message: string;
}

export const issue = (path: string, code: string, message: string): ConfigIssue => ({ path, code, message });
