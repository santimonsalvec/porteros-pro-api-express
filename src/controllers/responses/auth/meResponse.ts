import type { Language } from '../../../domain/i18n/language.js';

export interface MeResponse {
  userId: string;
  email: string;
  isAdmin: boolean;
  isProfileComplete: boolean;
  /** The language the person chose (feature 032); null until they choose one. */
  preferredLanguage: Language | null;
}
