import type { ICommandHandler } from '../../../../common/mediator/types.js';
import { deleteUnused, type DeleteResult } from '../../common/deletion.js';
import type { IAdminMatchSurfaceRepository, IReferenceUsage } from '../../common/ports.js';
import { DeleteMatchSurfaceCommand } from './deleteMatchSurfaceCommand.js';

export class DeleteMatchSurfaceCommandHandler implements ICommandHandler<DeleteMatchSurfaceCommand, DeleteResult> {
  constructor(private readonly deps: { surfaces: IAdminMatchSurfaceRepository; usage: IReferenceUsage }) {}

  handle({ surfaceId }: DeleteMatchSurfaceCommand): Promise<DeleteResult> {
    return deleteUnused(
      async () => (await this.deps.surfaces.getById(surfaceId)) !== null,
      () => this.deps.usage.surfaceUsage(surfaceId),
      () => this.deps.surfaces.delete(surfaceId),
    );
  }
}
