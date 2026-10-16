import { scopesIssue, type StaffScope } from '../../../../domain/staff/staffScope.js';
import type { ScopePlaces } from './staffViews.js';

/** Why these scopes can't be given (spec 031, contract F), or `null`: at least one, none repeated, all existing. */
export async function scopesRefusal(scopes: readonly StaffScope[], places: ScopePlaces | undefined): Promise<'scopes_required' | 'scope_not_found' | null> {
  const issue = scopesIssue(scopes);
  if (issue === 'scopes_required') return 'scopes_required';
  if (issue === 'duplicate_scope') return 'scope_not_found';
  if (!places) return null;
  for (const scope of scopes) {
    if (scope.kind === 'platform') continue;
    const found = scope.kind === 'market' ? await places.markets.getById(scope.id) : await places.countries.getById(scope.id);
    if (!found) return 'scope_not_found';
  }
  return null;
}
