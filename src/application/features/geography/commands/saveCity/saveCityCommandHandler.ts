import type { IClock } from '../../../../common/clock.js';
import type { ICommandHandler } from '../../../../common/mediator/types.js';
import type { IIdGenerator } from '../../../auth/common/ports.js';
import { City } from '../../../../../domain/locations/city.js';
import { canStopBeingAnchor, canUseAnchor, daneCodesValid } from '../../../../../domain/locations/locationRules.js';
import type { IAdminCityRepository, IAdminRegionRepository, IAdminZoneRepository, IFutureBookingsProbe } from '../../common/ports.js';
import { isSupportedTimeZone } from '../../common/timeZones.js';
import { needsAcknowledgement, warning, type Warning } from '../../common/warnings.js';
import { SaveCityCommand, type CityFields, type SaveCityResult } from './saveCityCommand.js';

export interface SaveCityDependencies {
  cities: IAdminCityRepository;
  regions: IAdminRegionRepository;
  zones: IAdminZoneRepository;
  futureBookings: IFutureBookingsProbe;
  ids: IIdGenerator;
  clock: IClock;
}

export class SaveCityCommandHandler implements ICommandHandler<SaveCityCommand, SaveCityResult> {
  constructor(private readonly deps: SaveCityDependencies) {}

  async handle(command: SaveCityCommand): Promise<SaveCityResult> {
    const stored = command.cityId === null ? null : await this.deps.cities.getById(command.cityId);
    if (command.cityId !== null && !stored) return { outcome: 'not_found' };

    const id = stored?.id ?? this.deps.ids.newId();
    const fields = { ...(stored ? fieldsOf(stored) : {}), ...command.fields } as CityFields;
    const fieldErrors = await this.fieldErrors(id, fields);
    if (Object.keys(fieldErrors).length > 0) return { outcome: 'invalid', fieldErrors };

    if (stored && stored.zoneCityId === null && fields.zoneCityId !== null && !(await this.canStopBeingAnchor(id))) {
      return { outcome: 'city_has_zones' };
    }
    const warnings = stored ? await this.warnings(stored, fields) : [];
    if (needsAcknowledgement(warnings, command.acknowledgeWarnings)) return { outcome: 'warnings', warnings };

    const city = new City({ id, ...fields, revision: stored ? command.revision : 0 });
    if (!stored) {
      await this.deps.cities.create(city);
      return { outcome: 'saved', cityId: id, created: true };
    }
    const result = await this.deps.cities.update(city);
    return result === 'saved' ? { outcome: 'saved', cityId: id, created: false } : { outcome: 'stale' };
  }

  private async fieldErrors(id: string, fields: CityFields): Promise<Record<string, string>> {
    const errors: Record<string, string> = {};
    if (!(await this.deps.regions.getById(fields.regionId))) errors.regionId = 'Region not found.';
    if (fields.timeZone !== null && !isSupportedTimeZone(fields.timeZone)) errors.timeZone = 'Must be an IANA time zone from the list.';
    if (!daneCodesValid(fields.daneStateCode, null)) errors.daneStateCode = 'Must be 2 digits.';
    else if (!daneCodesValid(fields.daneStateCode, fields.daneCityCode)) errors.daneCityCode = "Must be 5 digits that start with the department's code.";
    if (fields.zoneCityId !== null) {
      const anchor = await this.deps.cities.getById(fields.zoneCityId);
      if (!canUseAnchor(id, anchor)) errors.zoneCityId = 'invalid_anchor_city';
    }
    return errors;
  }

  private async canStopBeingAnchor(cityId: string): Promise<boolean> {
    const [zones, satellites] = await Promise.all([this.deps.zones.countByCity([cityId]), this.deps.cities.countSatellites([cityId])]);
    return canStopBeingAnchor((zones.get(cityId) ?? 0) > 0, (satellites.get(cityId) ?? 0) > 0);
  }

  /** A new time zone changes how future matches of the area read (research §4). */
  private async warnings(stored: City, fields: CityFields): Promise<Warning[]> {
    if (fields.timeZone === stored.timeZone) return [];
    const anchorId = stored.zoneCityId ?? stored.id;
    const hasFuture = await this.deps.futureBookings.hasFutureRequestsInArea(anchorId, this.deps.clock.now());
    return hasFuture ? [warning('time_zone_has_future_bookings', {})] : [];
  }
}

function fieldsOf(city: City): CityFields {
  return {
    name: city.name,
    regionId: city.regionId,
    timeZone: city.timeZone,
    zoneCityId: city.zoneCityId,
    daneStateCode: city.daneStateCode,
    daneCityCode: city.daneCityCode,
  };
}
