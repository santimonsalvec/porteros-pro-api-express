import type { RequestHandler } from 'express';
import { parseAcceptLanguage, type Language } from '../domain/i18n/language.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** The caller's language from `Accept-Language` (feature 032); null when absent or unsupported. */
      language?: Language | null;
    }
  }
}

/**
 * Reads `Accept-Language` on every request (feature 032, contracts/language-api.md): the app and the
 * admin send the bare code of their current language. Handlers fall back to it when the account has
 * no preference, so a sign-in code email or the test push speak the caller's language before any
 * choice is saved.
 */
export const languageMiddleware: RequestHandler = (req, _res, next) => {
  req.language = parseAcceptLanguage(req.header('accept-language'));
  next();
};
