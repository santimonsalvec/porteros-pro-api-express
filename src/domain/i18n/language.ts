/**
 * The languages people can read the product in (feature 032). Two-letter codes are the unit
 * everywhere: the request header, the user's preference, the catalogs. Spanish is the default
 * and the fallback. Formatting locales derive from the language and only drive dates: money keeps
 * the market's format in every language (research §1).
 */
export const LANGUAGES = ['es', 'en'] as const;

export type Language = (typeof LANGUAGES)[number];

export const DEFAULT_LANGUAGE: Language = 'es';

/** A supported code (case-insensitive), or null for anything else. */
export function parseLanguage(value: unknown): Language | null {
  if (typeof value !== 'string') return null;
  const code = value.trim().toLowerCase();
  return (LANGUAGES as readonly string[]).includes(code) ? (code as Language) : null;
}

/**
 * The first supported primary subtag of an `Accept-Language` header, by `q` weight (RFC 9110):
 * `en-US,en;q=0.9,es;q=0.8` → `en`; `pt-BR` → null.
 */
export function parseAcceptLanguage(header: string | undefined): Language | null {
  if (!header) return null;
  const candidates = header
    .split(',')
    .map((part, index) => {
      const [tag = '', ...params] = part.trim().split(';');
      const q = params.map((param) => param.trim()).find((param) => param.startsWith('q='));
      const weight = q ? Number(q.slice(2)) : 1;
      return { language: parseLanguage(tag.split('-')[0]), weight: Number.isFinite(weight) ? weight : 0, index };
    })
    .filter((candidate) => candidate.language !== null && candidate.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index);
  return candidates[0]?.language ?? null;
}

/** The account's preference wins; then the request's; then Spanish. */
export function resolveLanguage(account: Language | null | undefined, request: Language | null | undefined): Language {
  return account ?? request ?? DEFAULT_LANGUAGE;
}

/** The locale dates are formatted with for a language. */
export function localeOf(language: Language): string {
  return language === 'en' ? 'en-US' : 'es-CO';
}
