import type { ICommandHandler } from '../../../../common/mediator/types.js';
import type { IIdGenerator } from '../../../auth/common/ports.js';
import type { IGoalkeeperProfileRepository, IGoalkeeperRegistrationRepository } from '../../common/ports.js';
import { missingGoalkeeperSections, isGoalkeeperRegistrationComplete } from '../../common/goalkeeperSections.js';
import { toGoalkeeperRegistrationResponse } from '../../common/goalkeeperRegistrationResponse.js';
import { GoalkeeperProfile } from '../../../../../domain/goalkeepers/goalkeeperProfile.js';
import { ActivateGoalkeeperCommand, type ActivateGoalkeeperResult } from './activateGoalkeeperCommand.js';

export class ActivateGoalkeeperCommandHandler implements ICommandHandler<ActivateGoalkeeperCommand, ActivateGoalkeeperResult> {
  constructor(
    private readonly goalkeeperRegistrationRepository: IGoalkeeperRegistrationRepository,
    private readonly goalkeeperProfileRepository: IGoalkeeperProfileRepository,
    private readonly idGenerator: IIdGenerator,
  ) {}

  async handle(command: ActivateGoalkeeperCommand): Promise<ActivateGoalkeeperResult> {
    const registration = await this.goalkeeperRegistrationRepository.getByUserId(command.userId);

    if (registration?.status === 'active') {
      return { outcome: 'already_active' };
    }

    if (!registration || !isGoalkeeperRegistrationComplete(registration)) {
      return { outcome: 'incomplete', missingSections: missingGoalkeeperSections(registration) };
    }

    const profile = GoalkeeperProfile.createFromRegistration(this.idGenerator.newId(), registration);
    await this.goalkeeperProfileRepository.add(profile);

    registration.activate();
    await this.goalkeeperRegistrationRepository.update(registration);

    return { outcome: 'success', registration: toGoalkeeperRegistrationResponse(registration) };
  }
}
