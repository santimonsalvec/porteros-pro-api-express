import { ICommand } from '../../../../common/mediator/types.js';
import type { GeometryError } from '../../../../../domain/zones/zoneGeometry.js';
import type { Warning } from '../../common/warnings.js';
import type { ZoneCityCheck } from '../../common/zoneChecks.js';

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
  | { outcome: 'reason_required' }
  | { outcome: 'warnings'; warnings: Warning[] }
  | Exclude<ZoneCityCheck, { outcome: 'ok' }>;

/**
 * Creates a zone in an anchor city, or edits one (admin spec 003, US2). Deactivating it, or
 * redrawing a zone that goalkeepers or bookings point at, needs a reason (clarification 4).
 * The city of a zone never changes.
 */
export class SaveZoneCommand extends ICommand<SaveZoneResult> {
  /** Use `create` or `edit`. */
  constructor(
    readonly zoneId: string | null,
    readonly cityId: string | null,
    readonly revision: number,
    readonly fields: Partial<ZoneFields>,
    readonly reason: string | null,
    readonly acknowledgeWarnings: boolean,
  ) {
    super();
  }

  static create(fields: ZoneFields & { cityId: string }, acknowledgeWarnings = false): SaveZoneCommand {
    const { cityId, ...rest } = fields;
    return new SaveZoneCommand(null, cityId, 0, rest, null, acknowledgeWarnings);
  }

  static edit(zoneId: string, revision: number, changes: Partial<ZoneFields>, reason: string | null = null, acknowledgeWarnings = false): SaveZoneCommand {
    return new SaveZoneCommand(zoneId, null, revision, changes, reason, acknowledgeWarnings);
  }
}
