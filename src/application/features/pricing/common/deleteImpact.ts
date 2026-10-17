/** A zone as the delete warning names it. */
export interface ImpactZone {
  id: string;
  name: string;
  active: boolean;
}

/** The general rule that would apply to a goalkeeper's tier once their own rule goes (feature 033). */
export interface FallbackRule {
  fixedAmount: number;
  percentBps: number;
  kind: 'fixed' | 'percent' | 'mixed';
  origin: { scope: 'market' | 'country'; refId: string; name: string | null };
}

export interface DeleteImpact {
  zoneCount: number;
  zoneNames: string[];
  /** Goalkeeper rules only: `null` when no general rule covers that tier. */
  fallback?: FallbackRule | null;
}

/**
 * The active zones that lose their last usable record if `removedId` goes (FR-018): a rate's zones
 * stop quoting that duration, a commission's stop being offered. `coveringOf` lists the records that
 * apply to a zone at any level and tier; one the domain refuses never counts, as the quote cannot use it.
 */
export function zonesLeftWithout<Zone extends ImpactZone>(
  removedId: string,
  zones: readonly Zone[],
  coveringOf: (zone: Zone) => readonly { id: string; invalid: boolean }[],
): DeleteImpact {
  const losing = zones.filter((zone) => {
    if (!zone.active) return false;
    const covering = coveringOf(zone);
    return covering.some((record) => record.id === removedId) && !covering.some((record) => record.id !== removedId && !record.invalid);
  });
  return { zoneCount: losing.length, zoneNames: losing.map((zone) => zone.name) };
}
