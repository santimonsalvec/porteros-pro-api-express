/**
 * Where a setting may be defined, most specific first (spec 031, FR-013–FR-014): each setting
 * admits a subset of these levels, and the first one that defines it wins.
 */
export const SETTING_LEVELS = ['zone', 'market', 'country', 'platform'] as const;
export type SettingLevel = (typeof SETTING_LEVELS)[number];

/** A setting's effective value and the level it comes from; `origin: null` when it is missing. */
export interface Resolved<T> {
  value: T | null;
  origin: SettingLevel | null;
}

/** The value each level defines; absent or `null` means that level inherits. */
export type LayerValues<T> = Partial<Record<SettingLevel, T | null | undefined>>;

/** The first level, in `SETTING_LEVELS` order, that defines the value; else `platformFallback`. */
export function resolveLayered<T>(layers: LayerValues<T>, platformFallback: T | null = null): Resolved<T> {
  for (const level of SETTING_LEVELS) {
    const value = layers[level];
    if (value !== null && value !== undefined) return { value, origin: level };
  }
  return platformFallback === null ? { value: null, origin: null } : { value: platformFallback, origin: 'platform' };
}
