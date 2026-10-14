import { accessSettingsOrDefault, LOGIN_CODE_EXPIRY_MINUTES, type StoredAccessSettings } from '../../../../domain/auth/accessSettings.js';

/** What the admin's Configuración → Acceso reads (contracts/email-code-api.md). */
export interface AccessSettingsResponse {
  loginCodeExpiryMinutes: number;
  isDefault: boolean;
  revision: number;
  updatedAt: Date | null;
  /** The staff member's user id; the admin shows the name. */
  updatedBy: string | null;
  limits: { min: number; max: number; recommended: number };
}

export function toAccessSettingsResponse(stored: StoredAccessSettings | null): AccessSettingsResponse {
  return {
    ...accessSettingsOrDefault(stored),
    limits: { min: LOGIN_CODE_EXPIRY_MINUTES.min, max: LOGIN_CODE_EXPIRY_MINUTES.max, recommended: LOGIN_CODE_EXPIRY_MINUTES.default },
  };
}
