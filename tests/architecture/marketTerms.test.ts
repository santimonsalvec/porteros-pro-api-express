import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Markets (spec 031, research §12): the service operates in markets made of zones; municipalities
 * are billing data only. This walks the sources and fails when the anchor-city model comes back,
 * or when an operation resolver reaches the country through the regions again (FR-005).
 */

const ROOT = join(import.meta.dirname, '..', '..');

const ANCHOR_TERMS = /zoneCityId|anchorCity|resolveAnchorCityId/;

/** Where settings, quotes, offers and money are resolved: zone → market → country, never regions. */
const OPERATION_FEATURES = ['pricing', 'goalkeeperRequests', 'operatingBalance', 'notifications', 'bookingLifecycle', 'deposits', 'markets'];
const REGION_PORTS = /\bI(Admin)?RegionRepository\b/;

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

describe('markets, not anchor cities (spec 031)', () => {
  it('no source names the anchor-city model', () => {
    const offending = [...listFiles('src'), ...listFiles('scripts')]
      .map((file) => relative(ROOT, file))
      .filter((file) => ANCHOR_TERMS.test(readFileSync(join(ROOT, file), 'utf8')));
    expect(offending).toEqual([]);
  });

  it('no operation resolver reads the regions', () => {
    const offending = OPERATION_FEATURES.flatMap((feature) => listFiles(`src/application/features/${feature}`))
      .filter((file) => REGION_PORTS.test(readFileSync(file, 'utf8')))
      .map((file) => relative(ROOT, file));
    expect(offending).toEqual([]);
  });
});
