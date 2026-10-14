import { accessSettingsOrDefault } from '../../../../domain/auth/accessSettings.js';
import type { IAccessSettingsRepository } from './ports.js';

/** The minutes the next sign-in code lasts: read every time, so a change applies to the next one (SC-006). */
export async function currentLoginCodeExpiryMinutes(settings: Pick<IAccessSettingsRepository, 'get'>): Promise<number> {
  return accessSettingsOrDefault(await settings.get()).loginCodeExpiryMinutes;
}
