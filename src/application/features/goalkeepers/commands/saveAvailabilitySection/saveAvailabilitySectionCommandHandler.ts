import type { ICommandHandler } from '../../../../common/mediator/types.js';
import type { IIdGenerator } from '../../../auth/common/ports.js';
import type { IGoalkeeperRegistrationRepository } from '../../common/ports.js';
import type { IMarketRepository } from '../../../markets/common/ports.js';
import type { IZoneRepository } from '../../../zones/common/ports.js';
import { validateAvailabilitySelection } from '../../common/validateAvailabilitySelection.js';
import { toGoalkeeperRegistrationResponse } from '../../common/goalkeeperRegistrationResponse.js';
import { GoalkeeperRegistration } from '../../../../../domain/goalkeepers/goalkeeperRegistration.js';
import { SaveAvailabilitySectionCommand, type SaveAvailabilitySectionResult } from './saveAvailabilitySectionCommand.js';

export class SaveAvailabilitySectionCommandHandler
  implements ICommandHandler<SaveAvailabilitySectionCommand, SaveAvailabilitySectionResult>
{
  constructor(
    private readonly goalkeeperRegistrationRepository: IGoalkeeperRegistrationRepository,
    private readonly marketRepository: IMarketRepository,
    private readonly zoneRepository: IZoneRepository,
    private readonly idGenerator: IIdGenerator,
  ) {}

  async handle(command: SaveAvailabilitySectionCommand): Promise<SaveAvailabilitySectionResult> {
    let registration = await this.goalkeeperRegistrationRepository.getByUserId(command.userId);
    if (registration?.status === 'active') {
      return { outcome: 'already_active' };
    }

    const validation = await validateAvailabilitySelection(
      this.marketRepository,
      this.zoneRepository,
      command.marketId,
      command.zoneIds,
    );
    if (!validation.valid) {
      return validation.outcome === 'invalid_market'
        ? { outcome: 'invalid_market' }
        : { outcome: 'invalid_zones', invalidZoneIds: validation.invalidZoneIds };
    }
    const { zoneIds } = validation;

    const isNew = registration === null;
    if (!registration) {
      registration = GoalkeeperRegistration.createEmpty(this.idGenerator.newId(), command.userId);
    }

    registration.saveAvailability({ marketId: command.marketId, zoneIds });

    if (isNew) {
      await this.goalkeeperRegistrationRepository.add(registration);
    } else {
      await this.goalkeeperRegistrationRepository.update(registration);
    }

    return { outcome: 'success', registration: toGoalkeeperRegistrationResponse(registration) };
  }
}
