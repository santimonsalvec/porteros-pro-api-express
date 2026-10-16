/**
 * Where a staff member may work (spec 031, FR-037–FR-042): the whole platform, whole countries or
 * single markets. A member holds at least one; the owner role always means the platform.
 */
export type StaffScope = { kind: 'platform' } | { kind: 'country'; id: string } | { kind: 'market'; id: string };

export const PLATFORM_SCOPE: StaffScope = Object.freeze({ kind: 'platform' });

export function hasPlatformScope(scopes: readonly StaffScope[], isOwner: boolean): boolean {
  return isOwner || scopes.some((scope) => scope.kind === 'platform');
}

/** The countries a member holds whole. */
export const fullCountryIds = (scopes: readonly StaffScope[]): string[] => scopes.flatMap((scope) => (scope.kind === 'country' ? [scope.id] : []));

/** The single markets a member holds. */
export const scopedMarketIds = (scopes: readonly StaffScope[]): string[] => scopes.flatMap((scope) => (scope.kind === 'market' ? [scope.id] : []));

/** The scopes as stored: `platform` when there are none (members invited before spec 031). */
export function readScopes(value: unknown): StaffScope[] {
  if (!Array.isArray(value) || value.length === 0) return [PLATFORM_SCOPE];
  return value.flatMap((item: { kind?: unknown; id?: unknown }) => {
    if (item?.kind === 'platform') return [PLATFORM_SCOPE];
    if ((item?.kind === 'country' || item?.kind === 'market') && typeof item.id === 'string') return [{ kind: item.kind, id: item.id }];
    return [];
  });
}

const keyOf = (scope: StaffScope) => (scope.kind === 'platform' ? 'platform' : `${scope.kind}:${scope.id}`);

/** Why a member's scopes are refused, or `null`: at least one, none repeated (data-model §10). */
export function scopesIssue(scopes: readonly StaffScope[]): 'scopes_required' | 'duplicate_scope' | null {
  if (scopes.length === 0) return 'scopes_required';
  return new Set(scopes.map(keyOf)).size === scopes.length ? null : 'duplicate_scope';
}

/**
 * Whether a member may see a record of this country and market (FR-038): the platform, the whole
 * country, or — when the record has one — its market.
 */
export function covers(scopes: readonly StaffScope[], isOwner: boolean, target: { countryId: string | null; marketId: string | null }): boolean {
  if (hasPlatformScope(scopes, isOwner)) return true;
  if (target.countryId !== null && fullCountryIds(scopes).includes(target.countryId)) return true;
  return target.marketId !== null && scopedMarketIds(scopes).includes(target.marketId);
}

/** Whether a member holds the whole country, as creating and enabling markets needs (FR-041a). */
export function holdsCountry(scopes: readonly StaffScope[], isOwner: boolean, countryId: string): boolean {
  return hasPlatformScope(scopes, isOwner) || fullCountryIds(scopes).includes(countryId);
}
