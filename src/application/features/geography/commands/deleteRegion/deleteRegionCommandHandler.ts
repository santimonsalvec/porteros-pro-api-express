import type { ICommandHandler } from '../../../../common/mediator/types.js';
import { deleteUnused, type DeleteResult } from '../../common/deletion.js';
import type { IAdminRegionRepository, IReferenceUsage } from '../../common/ports.js';
import { DeleteRegionCommand } from './deleteRegionCommand.js';

export class DeleteRegionCommandHandler implements ICommandHandler<DeleteRegionCommand, DeleteResult> {
  constructor(private readonly deps: { regions: IAdminRegionRepository; usage: IReferenceUsage }) {}

  handle({ regionId }: DeleteRegionCommand): Promise<DeleteResult> {
    return deleteUnused(
      async () => (await this.deps.regions.getById(regionId)) !== null,
      () => this.deps.usage.regionUsage(regionId),
      () => this.deps.regions.delete(regionId),
    );
  }
}
