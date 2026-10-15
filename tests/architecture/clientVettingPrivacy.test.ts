import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..', '..');

/** What the client reads: quotes, its requests and bookings, and the booking it confirms. */
const CLIENT_FACING = [
  'src/application/features/goalkeeperRequests/common/requestResponse.ts',
  'src/application/features/goalkeeperRequests/common/matchFormatResponse.ts',
  'src/application/features/goalkeeperRequests/commands/confirmBooking',
  'src/application/features/goalkeeperRequests/commands/issueServiceQuote',
  'src/application/features/goalkeeperRequests/queries/getServiceQuote',
  'src/application/features/goalkeeperRequests/queries/listClientRequests',
];

/** The goalkeeper's level and how they got the seal stay inside the team (FR-005). */
const FORBIDDEN = ['goalkeepers/common/vettingViews', 'domain/goalkeepers/vetting'];

function tsFiles(path: string): string[] {
  const full = join(ROOT, path);
  if (!statSync(full).isDirectory()) return [full];
  return readdirSync(full).flatMap((entry) => tsFiles(join(path, entry))).filter((file) => file.endsWith('.ts'));
}

function importsOf(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  return [...source.matchAll(/(?:import|export)\s+(?:[^'"]*?from\s+)?['"]([^'"]+)['"]/g)].map((match) => match[1]!);
}

describe('client responses never learn how a goalkeeper was vetted (admin spec 030, FR-005)', () => {
  it.each(CLIENT_FACING)('%s does not import the vetting views or the vetting domain', (path) => {
    const offending = tsFiles(path).flatMap((file) =>
      importsOf(file)
        .filter((specifier) => FORBIDDEN.some((segment) => specifier.includes(segment)))
        .map((specifier) => `${file} → ${specifier}`),
    );

    expect(offending).toEqual([]);
  });
});
