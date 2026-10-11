import type { ICommandHandler } from '../../../../common/mediator/types.js';
import { deleteUnused, type DeleteResult } from '../../common/deletion.js';
import type { IAdminZoneRepository, IReferenceUsage } from '../../common/ports.js';
import { DeleteZoneCommand } from './deleteZoneCommand.js';

export class DeleteZoneCommandHandler implements ICommandHandler<DeleteZoneCommand, DeleteResult> {
  constructor(private readonly deps: { zones: IAdminZoneRepository; usage: IReferenceUsage }) {}

  handle({ zoneId }: DeleteZoneCommand): Promise<DeleteResult> {
    return deleteUnused(
      async () => (await this.deps.zones.getById(zoneId)) !== null,
      () => this.deps.usage.zoneUsage(zoneId),
      () => this.deps.zones.delete(zoneId),
    );
  }
}
