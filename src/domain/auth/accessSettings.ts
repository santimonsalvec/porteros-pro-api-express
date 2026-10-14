/** How long a sign-in code lasts, in whole minutes, for the app and the admin web (admin spec 009, FR-022). */
export const LOGIN_CODE_EXPIRY_MINUTES = { min: 1, max: 10, default: 2 } as const;

export function isValidLoginCodeExpiry(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= LOGIN_CODE_EXPIRY_MINUTES.min &&
    value <= LOGIN_CODE_EXPIRY_MINUTES.max
  );
}

/** The one `accessSettings` document (`_id: 'global'`). */
export interface StoredAccessSettings {
  loginCodeExpiryMinutes: number;
  revision: number;
  updatedAt: Date;
  /** The staff member's user id. */
  updatedBy: string;
}

export interface AccessSettings {
  loginCodeExpiryMinutes: number;
  /** True while nobody has saved the settings. */
  isDefault: boolean;
  revision: number;
  updatedAt: Date | null;
  updatedBy: string | null;
}

export function accessSettingsOrDefault(stored: StoredAccessSettings | null): AccessSettings {
  if (!stored) {
    return { loginCodeExpiryMinutes: LOGIN_CODE_EXPIRY_MINUTES.default, isDefault: true, revision: 0, updatedAt: null, updatedBy: null };
  }
  return { ...stored, isDefault: false };
}
