import type { ICommandHandler } from '../../../../common/mediator/types.js';
import type { IIdGenerator } from '../../../auth/common/ports.js';
import type { IPorteroProfileRepository, IPorteroRegistrationRepository } from '../../common/ports.js';
import { missingPorteroSections, isPorteroRegistrationComplete } from '../../common/porteroSections.js';
import { toPorteroRegistrationResponse } from '../../common/porteroRegistrationResponse.js';
import { PorteroProfile } from '../../../../../domain/porteros/porteroProfile.js';
import { ActivatePorteroCommand, type ActivatePorteroResult } from './activatePorteroCommand.js';

export class ActivatePorteroCommandHandler implements ICommandHandler<ActivatePorteroCommand, ActivatePorteroResult> {
  constructor(
    private readonly porteroRegistrationRepository: IPorteroRegistrationRepository,
    private readonly porteroProfileRepository: IPorteroProfileRepository,
    private readonly idGenerator: IIdGenerator,
  ) {}

  async handle(command: ActivatePorteroCommand): Promise<ActivatePorteroResult> {
    const registration = await this.porteroRegistrationRepository.getByUserId(command.userId);

    if (registration?.status === 'active') {
      return { outcome: 'already_active' };
    }

    if (!registration || !isPorteroRegistrationComplete(registration)) {
      return { outcome: 'incomplete', missingSections: missingPorteroSections(registration) };
    }

    const profile = PorteroProfile.createFromRegistration(this.idGenerator.newId(), registration);
    await this.porteroProfileRepository.add(profile);

    registration.activate();
    await this.porteroRegistrationRepository.update(registration);

    return { outcome: 'success', registration: toPorteroRegistrationResponse(registration) };
  }
}
