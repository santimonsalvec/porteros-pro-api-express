import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Store compliance (feature 029): the money a goalkeeper keeps is an "operating balance" paid in
 * through "deposits" — never a wallet, credits, coins or points, which an app review could read as
 * virtual currency (Apple Guideline 3.1.3(e), Google Play). This walks the sources and fails when
 * an old term comes back.
 */

const ROOT = join(import.meta.dirname, '..', '..');

/** The migration has to name the old collections and fields it renames. */
const EXEMPT_FILES = new Set(['scripts/migrate-029-operating-balance.ts', 'scripts/lib/migrate029.ts']);

/** Anywhere in a file, comments included: code names, routes, keys, copy. */
const IDENTIFIER_TERMS = /wallet|top[-_ ]?ups?|billetera|monedero|\brecarg(?!os?\b)\w*/i;

/** Only inside string literals and templates: Spanish copy a person reads. */
const COPY_TERMS = /\bcr[eé]ditos?\b|\bmonedas?\s+(?:virtual|digital)\w*|\bpuntos?\b/i;

/**
 * Removed before looking: each one is a term the law or the spec itself asks for.
 *  - "nota(s) crédito" / `credit_note` / `creditNote`: the tax document the DIAN defines.
 *  - "moneda local" / "moneda del país": the currency, which the spec requires to be shown.
 */
const ALLOWED = /notas?[-_\s]cr[eé]dito|credit_?note|moneda\s+(?:local|del\s+pa[ií]s)/gi;

function listFiles(dir: string, extensions: string[]): string[] {
  const results: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current)) {
      if (entry === 'node_modules' || entry === 'dist') continue;
      const full = join(current, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (extensions.some((extension) => entry.endsWith(extension))) results.push(full);
    }
  };
  walk(join(ROOT, dir));
  return results;
}

function stringLiteralsOf(source: string): string[] {
  return source.match(/(['"`])(?:\\[\s\S]|(?!\1)[^\\])*\1/g) ?? [];
}

function offencesIn(file: string): string[] {
  const path = relative(ROOT, file);
  if (EXEMPT_FILES.has(path)) return [];
  const source = readFileSync(file, 'utf8').replace(ALLOWED, '');
  const found: string[] = [];
  const identifier = IDENTIFIER_TERMS.exec(source);
  if (identifier) found.push(`${path}: identifier '${identifier[0]}'`);
  for (const literal of stringLiteralsOf(source)) {
    const copy = COPY_TERMS.exec(literal);
    if (copy) found.push(`${path}: copy '${copy[0]}' in ${literal.slice(0, 60)}`);
  }
  return found;
}

describe('store compliance: no wallet / credits / coins / points vocabulary', () => {
  it('src/ never names the old concepts', () => {
    const offences = listFiles('src', ['.ts']).flatMap(offencesIn);
    expect(offences).toEqual([]);
  });

  it('scripts/ never names the old concepts', () => {
    const offences = listFiles('scripts', ['.ts']).flatMap(offencesIn);
    expect(offences).toEqual([]);
  });

  it('the allowlist only forgives the fiscal document and the currency', () => {
    expect('una nota crédito y un credit_note'.replace(ALLOWED, '')).toBe('una  y un ');
    expect('La moneda local es COP'.replace(ALLOWED, '')).toBe('La  es COP');
    expect(COPY_TERMS.test('"Tus créditos"')).toBe(true);
    expect(IDENTIFIER_TERMS.test('walletId')).toBe(true);
    expect(IDENTIFIER_TERMS.test('/top-ups')).toBe(true);
  });
});
