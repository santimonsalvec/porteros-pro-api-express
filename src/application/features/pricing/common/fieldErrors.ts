import type { ConfigIssue } from '../../../../domain/pricing/configIssue.js';

/** Issues as `validation_failed` field errors: path → stable code, the first one per path. */
export function fieldErrorsOf(issues: readonly ConfigIssue[]): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const { path, code } of issues) errors[path] ??= code;
  return errors;
}
