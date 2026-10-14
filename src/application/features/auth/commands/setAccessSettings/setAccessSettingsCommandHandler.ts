import type { IClock } from '../../../../common/clock.js';
import type { ICommandHandler } from '../../../../common/mediator/types.js';
import { isValidLoginCodeExpiry } from '../../../../../domain/auth/accessSettings.js';
import { toAccessSettingsResponse } from '../../common/accessSettingsResponse.js';
import type { IAccessSettingsRepository } from '../../common/ports.js';
import { SetAccessSettingsCommand, type SetAccessSettingsResult } from './setAccessSettingsCommand.js';

const OUT_OF_RANGE = 'Escribe un número entero de minutos entre 1 y 10';

/** Whole minutes from 1 to 10; the first save is at revision 0, the next ones at the revision read. */
export class SetAccessSettingsCommandHandler implements ICommandHandler<SetAccessSettingsCommand, SetAccessSettingsResult> {
  constructor(
    private readonly repository: IAccessSettingsRepository,
    private readonly clock: IClock,
  ) {}

  async handle(command: SetAccessSettingsCommand): Promise<SetAccessSettingsResult> {
    const minutes = command.loginCodeExpiryMinutes;
    if (!isValidLoginCodeExpiry(minutes)) return { outcome: 'invalid', fieldErrors: { loginCodeExpiryMinutes: OUT_OF_RANGE } };

    const settings = { loginCodeExpiryMinutes: minutes, updatedAt: this.clock.now(), updatedBy: command.userId };
    const current = await this.repository.get();
    const written = current ? await this.repository.update(settings, command.revision) : command.revision === 0 ? await this.repository.create(settings) : 'stale';
    if (written === 'stale') return { outcome: 'stale' };
    return { outcome: 'saved', settings: toAccessSettingsResponse(await this.repository.get()) };
  }
}
