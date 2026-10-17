import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LANGUAGE,
  LANGUAGES,
  localeOf,
  parseAcceptLanguage,
  parseLanguage,
  resolveLanguage,
} from '../../../../src/domain/i18n/language.js';

describe('Language (feature 032)', () => {
  it('supports Spanish first, then English', () => {
    expect(LANGUAGES).toEqual(['es', 'en']);
    expect(DEFAULT_LANGUAGE).toBe('es');
  });

  it('parses a supported code and nothing else', () => {
    expect(parseLanguage('es')).toBe('es');
    expect(parseLanguage('en')).toBe('en');
    expect(parseLanguage('EN')).toBe('en');
    expect(parseLanguage('fr')).toBeNull();
    expect(parseLanguage('')).toBeNull();
    expect(parseLanguage(undefined)).toBeNull();
    expect(parseLanguage(42)).toBeNull();
  });

  it('reads the first supported primary subtag of Accept-Language by weight', () => {
    expect(parseAcceptLanguage('en-US,en;q=0.9,es;q=0.8')).toBe('en');
    expect(parseAcceptLanguage('es-CO')).toBe('es');
    expect(parseAcceptLanguage('pt-BR')).toBeNull();
    expect(parseAcceptLanguage('pt-BR,en;q=0.5')).toBe('en');
    expect(parseAcceptLanguage('es;q=0.3, en;q=0.8')).toBe('en');
    expect(parseAcceptLanguage('*')).toBeNull();
    expect(parseAcceptLanguage(undefined)).toBeNull();
    expect(parseAcceptLanguage('')).toBeNull();
  });

  it('resolves the account first, then the request, then Spanish', () => {
    expect(resolveLanguage('en', 'es')).toBe('en');
    expect(resolveLanguage(null, 'en')).toBe('en');
    expect(resolveLanguage(null, null)).toBe('es');
    expect(resolveLanguage(undefined, undefined)).toBe('es');
  });

  it('maps a language to its formatting locale', () => {
    expect(localeOf('es')).toBe('es-CO');
    expect(localeOf('en')).toBe('en-US');
  });
});
