import type { ICommandHandler } from '../../../../common/mediator/types.js';
import type { IIdGenerator } from '../../../auth/common/ports.js';
import type { IGoalkeeperRegistrationRepository } from '../../common/ports.js';
import type { ICityRepository } from '../../../locations/common/ports.js';
import { resolveAnchorCityId } from '../../../locations/common/resolveAnchorCityId.js';
import type { IZoneRepository } from '../../../zones/common/ports.js';
import { toGoalkeeperRegistrationResponse } from '../../common/goalkeeperRegistrationResponse.js';
import { GoalkeeperRegistration } from '../../../../../domain/goalkeepers/goalkeeperRegistration.js';
import { SaveAvailabilitySectionCommand, type SaveAvailabilitySectionResult } from './saveAvailabilitySectionCommand.js';

export class SaveAvailabilitySectionCommandHandler
  implements ICommandHandler<SaveAvailabilitySectionCommand, SaveAvailabilitySectionResult>
{
  constructor(
    private readonly goalkeeperRegistrationRepository: IGoalkeeperRegistrationRepository,
    private readonly cityRepository: ICityRepository,
    private readonly zoneRepository: IZoneRepository,
    private readonly idGenerator: IIdGenerator,
  ) {}

  async handle(command: SaveAvailabilitySectionCommand): Promise<SaveAvailabilitySectionResult> {
    let registration = await this.goalkeeperRegistrationRepository.getByUserId(command.userId);
    if (registration?.status === 'active') {
      return { outcome: 'already_active' };
    }

    const city = await this.cityRepository.getById(command.cityId);
    if (!city) {
      return { outcome: 'invalid_city' };
    }

    const anchorCityId = resolveAnchorCityId(city);
    const zoneIds = [...new Set(command.zoneIds)];
    const zones = await this.zoneRepository.getManyByIds(zoneIds);
    const zoneById = new Map(zones.map((zone) => [zone.id, zone]));
    const invalidZoneIds = zoneIds.filter((zoneId) => {
      const zone = zoneById.get(zoneId);
      return !zone || !zone.active || zone.cityId !== anchorCityId;
    });
    if (invalidZoneIds.length > 0) {
      return { outcome: 'invalid_zones', invalidZoneIds };
    }

    const isNew = registration === null;
    if (!registration) {
      registration = GoalkeeperRegistration.createEmpty(this.idGenerator.newId(), command.userId);
    }

    registration.saveAvailability({ cityId: command.cityId, zoneIds });

    if (isNew) {
      await this.goalkeeperRegistrationRepository.add(registration);
    } else {
      await this.goalkeeperRegistrationRepository.update(registration);
    }

    return { outcome: 'success', registration: toGoalkeeperRegistrationResponse(registration) };
  }
}
