import type { ICommandHandler } from '../../../../common/mediator/types.js';
import type { IIdGenerator } from '../../../auth/common/ports.js';
import { Region } from '../../../../../domain/locations/region.js';
import type { IAdminCountryRepository, IAdminRegionRepository } from '../../common/ports.js';
import { SaveRegionCommand, type RegionFields, type SaveRegionResult } from './saveRegionCommand.js';

export class SaveRegionCommandHandler implements ICommandHandler<SaveRegionCommand, SaveRegionResult> {
  constructor(private readonly deps: { regions: IAdminRegionRepository; countries: IAdminCountryRepository; ids: IIdGenerator }) {}

  async handle(command: SaveRegionCommand): Promise<SaveRegionResult> {
    const stored = command.regionId === null ? null : await this.deps.regions.getById(command.regionId);
    if (command.regionId !== null && !stored) return { outcome: 'not_found' };

    const fields = { ...(stored ? { name: stored.name, countryId: stored.countryId } : {}), ...command.fields } as RegionFields;
    if (!fields.countryId || !(await this.deps.countries.getById(fields.countryId))) {
      return { outcome: 'invalid', fieldErrors: { countryId: 'Country not found.' } };
    }
    const id = stored?.id ?? this.deps.ids.newId();
    const region = new Region({ id, ...fields, revision: stored ? command.revision : 0 });
    if (!stored) {
      await this.deps.regions.create(region);
      return { outcome: 'saved', regionId: id, created: true };
    }
    const result = await this.deps.regions.update(region);
    return result === 'saved' ? { outcome: 'saved', regionId: id, created: false } : { outcome: 'stale' };
  }
}
