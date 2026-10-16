import type { ICommandHandler } from '../../../../common/mediator/types.js';
import type { IIdGenerator } from '../../../auth/common/ports.js';
import { City } from '../../../../../domain/locations/city.js';
import { daneCodesValid } from '../../../../../domain/locations/locationRules.js';
import type { IAdminCityRepository, IAdminRegionRepository } from '../../common/ports.js';
import { SaveCityCommand, type CityFields, type SaveCityResult } from './saveCityCommand.js';

export interface SaveCityDependencies {
  cities: IAdminCityRepository;
  regions: IAdminRegionRepository;
  ids: IIdGenerator;
}

export class SaveCityCommandHandler implements ICommandHandler<SaveCityCommand, SaveCityResult> {
  constructor(private readonly deps: SaveCityDependencies) {}

  async handle(command: SaveCityCommand): Promise<SaveCityResult> {
    const stored = command.cityId === null ? null : await this.deps.cities.getById(command.cityId);
    if (command.cityId !== null && !stored) return { outcome: 'not_found' };

    const id = stored?.id ?? this.deps.ids.newId();
    const fields = { ...(stored ? fieldsOf(stored) : {}), ...command.fields } as CityFields;
    const fieldErrors = await this.fieldErrors(fields);
    if (Object.keys(fieldErrors).length > 0) return { outcome: 'invalid', fieldErrors };

    const city = new City({ id, ...fields, revision: stored ? command.revision : 0 });
    if (!stored) {
      await this.deps.cities.create(city);
      return { outcome: 'saved', cityId: id, created: true };
    }
    const result = await this.deps.cities.update(city);
    return result === 'saved' ? { outcome: 'saved', cityId: id, created: false } : { outcome: 'stale' };
  }

  private async fieldErrors(fields: CityFields): Promise<Record<string, string>> {
    const errors: Record<string, string> = {};
    if (!(await this.deps.regions.getById(fields.regionId))) errors.regionId = 'Region not found.';
    if (!daneCodesValid(fields.daneStateCode, null)) errors.daneStateCode = 'Must be 2 digits.';
    else if (!daneCodesValid(fields.daneStateCode, fields.daneCityCode)) errors.daneCityCode = "Must be 5 digits that start with the department's code.";
    return errors;
  }
}

function fieldsOf(city: City): CityFields {
  return {
    name: city.name,
    regionId: city.regionId,
    daneStateCode: city.daneStateCode,
    daneCityCode: city.daneCityCode,
  };
}
