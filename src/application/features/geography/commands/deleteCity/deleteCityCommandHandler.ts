import type { ICommandHandler } from '../../../../common/mediator/types.js';
import { deleteUnused, type DeleteResult } from '../../common/deletion.js';
import type { IAdminCityRepository, IReferenceUsage } from '../../common/ports.js';
import { DeleteCityCommand } from './deleteCityCommand.js';

export class DeleteCityCommandHandler implements ICommandHandler<DeleteCityCommand, DeleteResult> {
  constructor(private readonly deps: { cities: IAdminCityRepository; usage: IReferenceUsage }) {}

  handle({ cityId }: DeleteCityCommand): Promise<DeleteResult> {
    return deleteUnused(
      async () => (await this.deps.cities.getById(cityId)) !== null,
      () => this.deps.usage.cityUsage(cityId),
      () => this.deps.cities.delete(cityId),
    );
  }
}
