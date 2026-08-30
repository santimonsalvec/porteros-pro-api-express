import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..', '..');

function listTsFiles(dir: string): string[] {
  const absoluteDir = join(ROOT, dir);
  const results: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (entry.endsWith('.ts')) {
        results.push(full);
      }
    }
  };
  walk(absoluteDir);
  return results;
}

function importSpecifiersOf(filePath: string): string[] {
  const source = readFileSync(filePath, 'utf8');
  const specifiers: string[] = [];
  const importRegex = /(?:import|export)\s+(?:[^'"]*?from\s+)?['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(source)) !== null) {
    specifiers.push(match[1]!);
  }
  return specifiers;
}

function assertNoForbiddenImports(dir: string, forbidden: string[]): void {
  for (const file of listTsFiles(dir)) {
    for (const specifier of importSpecifiersOf(file)) {
      for (const forbiddenSegment of forbidden) {
        if (specifier.includes(forbiddenSegment)) {
          throw new Error(
            `${file} imports '${specifier}', which crosses into a forbidden layer ('${forbiddenSegment}')`,
          );
        }
      }
    }
  }
}

describe('layering (Domain -> Application -> Infrastructure dependency rule)', () => {
  it('Domain layer never imports from Application, Infrastructure, or controllers', () => {
    expect(() =>
      assertNoForbiddenImports('src/domain', ['/application/', '/infrastructure/', '/controllers/']),
    ).not.toThrow();
  });

  it('Application layer never imports from Infrastructure or controllers', () => {
    expect(() => assertNoForbiddenImports('src/application', ['/infrastructure/', '/controllers/'])).not.toThrow();
  });
});
