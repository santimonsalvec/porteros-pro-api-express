import { z } from 'zod';
import { LANGUAGES } from '../../../domain/i18n/language.js';

/** `PUT /profile/language` and `PUT /admin/me/language` (feature 032). */
export const setLanguageRequestSchema = z.object({
  language: z.enum(LANGUAGES),
});
