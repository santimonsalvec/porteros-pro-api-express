import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Localization (feature 032): every sentence the API writes for a person — push, inbox, the
 * payment return page, the test push — comes from the message catalog in `src/domain/i18n/messages/`,
 * rendered in the recipient's language. This walks `src/` and fails when Spanish copy appears
 * anywhere else, so no notice can slip back into a single language.
 */

const ROOT = join(import.meta.dirname, '..', '..');

/** Where copy belongs: the catalogs, and the OpenAPI document's own prose. */
const EXEMPT_DIRS = ['src/domain/i18n/messages/', 'src/infrastructure/openapi/'];

/**
 * Data the admin web shows as it comes (permission descriptions, readiness and pricing diagnostics,
 * geometry and settings validation, export labels): Spanish by design today, outside feature 032's
 * scope (research §11). A notice must never land here — add the sentence to the catalog instead.
 */
const EXEMPT_FILES = new Set([
  'src/domain/staff/permissionCatalog.ts',
  'src/domain/staff/staffRole.ts',
  'src/domain/zones/zoneGeometry.ts',
  'src/application/features/geography/common/readiness.ts',
  'src/application/features/geography/common/warnings.ts',
  'src/application/features/users/common/userSearch.ts',
  'src/application/features/pricing/queries/getPricingPreview/getPricingPreviewQueryHandler.ts',
  'src/application/features/invoicing/common/documentAdminViews.ts',
  'src/application/features/invoicing/queries/exportDocuments/exportDocumentsQueryHandler.ts',
  'src/application/features/deposits/queries/exportDeposits/exportDepositsQueryHandler.ts',
  'src/application/features/staff/common/staffViews.ts',
  'src/application/features/staff/common/auditViews.ts',
  'src/application/features/auth/commands/setAccessSettings/setAccessSettingsCommandHandler.ts',
  'src/infrastructure/invoicing/siigoInvoicingProvider.ts',
  'src/controllers/goalkeeperRequestsController.ts',
  'src/controllers/goalkeeperController.ts',
]);

/** An accented letter or an inverted mark: no identifier, route or key carries one. */
const SPANISH_COPY = /[áéíóúñÁÉÍÓÚÑ¿¡]/;

function listFiles(dir: string): string[] {
  const results: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current)) {
      if (entry === 'node_modules' || entry === 'dist') continue;
      const full = join(current, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith('.ts')) results.push(full);
    }
  };
  walk(join(ROOT, dir));
  return results;
}

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(?<!:)\/\/.*/g, '');
}

function stringLiteralsOf(source: string): string[] {
  return source.match(/(['"`])(?:\\[\s\S]|(?!\1)[^\\])*\1/g) ?? [];
}

function offencesIn(file: string): string[] {
  const path = relative(ROOT, file);
  if (EXEMPT_DIRS.some((dir) => path.startsWith(dir)) || EXEMPT_FILES.has(path)) return [];
  const source = withoutComments(readFileSync(file, 'utf8'));
  return stringLiteralsOf(source)
    .filter((literal) => SPANISH_COPY.test(literal))
    .map((literal) => `${path}: ${literal.slice(0, 70)}`);
}

describe('localization: copy lives in the message catalog', () => {
  it('src/ holds no Spanish copy outside src/domain/i18n/messages', () => {
    const offences = listFiles('src').flatMap(offencesIn);
    expect(offences).toEqual([]);
  });

  it('the signal catches copy and forgives identifiers', () => {
    expect(SPANISH_COPY.test("'Depósito aprobado'")).toBe(true);
    expect(SPANISH_COPY.test("'¿Vas al partido?'")).toBe(true);
    expect(SPANISH_COPY.test("'preferredLanguage'")).toBe(false);
    expect(SPANISH_COPY.test("'Deposit approved'")).toBe(false);
  });
});
