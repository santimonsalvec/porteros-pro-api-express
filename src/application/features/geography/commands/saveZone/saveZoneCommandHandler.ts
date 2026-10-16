import type { ICommandHandler } from '../../../../common/mediator/types.js';
import type { IIdGenerator } from '../../../auth/common/ports.js';
import { Zone, type ZoneGeometry } from '../../../../../domain/zones/zone.js';
import type { IAdminZoneRepository, IReferenceUsage } from '../../common/ports.js';
import type { IAdminMarketRepository } from '../../../markets/common/ports.js';
import { checkZoneMarket, reviewZoneGeometry } from '../../common/zoneChecks.js';
import { SaveZoneCommand, type SaveZoneResult, type ZoneAction, type ZoneFields } from './saveZoneCommand.js';

export interface SaveZoneDependencies {
  markets: Pick<IAdminMarketRepository, 'getById' | 'getByIds'>;
  zones: IAdminZoneRepository;
  usage: IReferenceUsage;
  ids: IIdGenerator;
}

export class SaveZoneCommandHandler implements ICommandHandler<SaveZoneCommand, SaveZoneResult> {
  constructor(private readonly deps: SaveZoneDependencies) {}

  async handle(command: SaveZoneCommand): Promise<SaveZoneResult> {
    const stored = command.zoneId === null ? null : await this.deps.zones.getById(command.zoneId);
    if (command.zoneId !== null && !stored) return { outcome: 'not_found' };

    if (stored && command.marketId !== null && command.marketId !== stored.marketId) return { outcome: 'zone_market_immutable' };
    const marketId = stored?.marketId ?? command.marketId!;
    if (!stored) {
      const market = await checkZoneMarket(this.deps.markets, marketId);
      if (market.outcome !== 'ok') return market;
    }
    const id = stored?.id ?? this.deps.ids.newId();
    const fields = { ...(stored ? fieldsOf(stored) : {}), ...command.fields } as ZoneFields;

    const sameSlug = await this.deps.zones.findBySlug(fields.slug);
    if (sameSlug && sameSlug.id !== id) return { outcome: 'zone_slug_taken' };

    const redrawn = !stored || JSON.stringify(fields.geometry) !== JSON.stringify(stored.geometry);
    const reactivated = stored !== null && !stored.active && fields.active;
    if (redrawn || reactivated) {
      const review = await reviewZoneGeometry(this.deps, fields.geometry, stored?.id ?? null, fields.active);
      if (review.errors.length > 0) return { outcome: 'invalid_geometry', errors: review.errors };
      if (review.conflicts.length > 0) return { outcome: 'zone_conflict', conflicts: review.conflicts };
    }

    if (stored && command.reason === null && (await this.needsReason(stored, fields, redrawn))) return { outcome: 'reason_required' };

    const zone = new Zone({ id, marketId, ...fields, geometry: fields.geometry as ZoneGeometry, revision: stored ? command.revision : 0 });
    if (!stored) {
      await this.deps.zones.create(zone);
      return { outcome: 'saved', zoneId: id, action: 'create' };
    }
    const result = await this.deps.zones.update(zone);
    return result === 'saved' ? { outcome: 'saved', zoneId: id, action: actionOf(stored, fields) } : { outcome: 'stale' };
  }

  /** Deactivating, or redrawing a zone something points at (clarification 4). */
  private async needsReason(stored: Zone, fields: ZoneFields, redrawn: boolean): Promise<boolean> {
    if (stored.active && !fields.active) return true;
    return redrawn && (await this.deps.usage.zoneUsage(stored.id)) !== null;
  }
}

function actionOf(stored: Zone, fields: ZoneFields): ZoneAction {
  if (stored.active && !fields.active) return 'deactivate';
  if (!stored.active && fields.active) return 'reactivate';
  return 'update';
}

function fieldsOf(zone: Zone): ZoneFields {
  return { name: zone.name, slug: zone.slug, geometry: zone.geometry, active: zone.active, displayOrder: zone.displayOrder };
}
