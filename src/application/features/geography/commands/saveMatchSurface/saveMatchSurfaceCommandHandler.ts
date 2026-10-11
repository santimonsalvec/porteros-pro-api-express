import type { ICommandHandler } from '../../../../common/mediator/types.js';
import type { IIdGenerator } from '../../../auth/common/ports.js';
import { MatchSurface } from '../../../../../domain/pricing/matchSurface.js';
import type { IAdminMatchSurfaceRepository } from '../../common/ports.js';
import { SaveMatchSurfaceCommand, type MatchSurfaceFields, type SaveMatchSurfaceResult } from './saveMatchSurfaceCommand.js';

export class SaveMatchSurfaceCommandHandler implements ICommandHandler<SaveMatchSurfaceCommand, SaveMatchSurfaceResult> {
  constructor(private readonly deps: { surfaces: IAdminMatchSurfaceRepository; ids: IIdGenerator }) {}

  async handle(command: SaveMatchSurfaceCommand): Promise<SaveMatchSurfaceResult> {
    const stored = command.surfaceId === null ? null : await this.deps.surfaces.getById(command.surfaceId);
    if (command.surfaceId !== null && !stored) return { outcome: 'not_found' };

    const fields = { ...(stored ? { name: stored.name, active: stored.active, order: stored.order } : {}), ...command.fields } as MatchSurfaceFields;
    if (stored?.active && !fields.active && command.reason === null) return { outcome: 'reason_required' };

    const id = stored?.id ?? this.deps.ids.newId();
    const surface = new MatchSurface({ id, ...fields, revision: stored ? command.revision : 0 });
    if (!stored) {
      await this.deps.surfaces.create(surface);
      return { outcome: 'saved', surfaceId: id, created: true };
    }
    const result = await this.deps.surfaces.update(surface);
    return result === 'saved' ? { outcome: 'saved', surfaceId: id, created: false } : { outcome: 'stale' };
  }
}
