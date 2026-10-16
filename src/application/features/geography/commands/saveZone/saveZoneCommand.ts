import { ICommand } from '../../../../common/mediator/types.js';
import type { GeometryError, ZoneConflict } from '../../../../../domain/zones/zoneGeometry.js';
import type { ZoneMarketCheck } from '../../common/zoneChecks.js';

export interface ZoneFields {
  name: string;
  slug: string;
  geometry: unknown;
  active: boolean;
  displayOrder: number;
}

/** What the audit log records for the write. */
export type ZoneAction = 'create' | 'update' | 'deactivate' | 'reactivate';

export type SaveZoneResult =
  | { outcome: 'saved'; zoneId: string; action: ZoneAction }
  | { outcome: 'not_found' }
  | { outcome: 'stale' }
  | { outcome: 'zone_slug_taken' }
  | { outcome: 'invalid_geometry'; errors: GeometryError[] }
  | { outcome: 'zone_conflict'; conflicts: ZoneConflict[] }
  | { outcome: 'zone_market_immutable' }
  | { outcome: 'reason_required' }
  | Exclude<ZoneMarketCheck, { outcome: 'ok' }>;

/**
 * Creates a zone in a market, or edits one (admin spec 003, US2; spec 031). An active zone never
 * crosses or touches another active one (FR-003, FR-003a), and a zone never changes market
 * (FR-002a). Deactivating it, or redrawing a zone something points at, needs a reason.
 */
export class SaveZoneCommand extends ICommand<SaveZoneResult> {
  /** Use `create` or `edit`. */
  constructor(
    readonly zoneId: string | null,
    readonly marketId: string | null,
    readonly revision: number,
    readonly fields: Partial<ZoneFields>,
    readonly reason: string | null,
  ) {
    super();
  }

  static create(fields: ZoneFields & { marketId: string }): SaveZoneCommand {
    const { marketId, ...rest } = fields;
    return new SaveZoneCommand(null, marketId, 0, rest, null);
  }

  /** `changes.marketId`, when sent, must be the zone's own. */
  static edit(zoneId: string, revision: number, changes: Partial<ZoneFields> & { marketId?: string }, reason: string | null = null): SaveZoneCommand {
    const { marketId, ...rest } = changes;
    return new SaveZoneCommand(zoneId, marketId ?? null, revision, rest, reason);
  }
}
