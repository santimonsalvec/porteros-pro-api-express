import type { ICommandHandler } from '../../../../common/mediator/types.js';
import { normalizeToken } from '../../../../../domain/devices/deviceRules.js';
import type { IDeviceLogger, IDeviceRepository, ITokenFingerprint } from '../../common/ports.js';
import { UnregisterDeviceCommand, type UnregisterDeviceResult } from './unregisterDeviceCommand.js';

export interface UnregisterDeviceDependencies {
  devices: IDeviceRepository;
  logger: IDeviceLogger;
  fingerprint: ITokenFingerprint;
}

/**
 * Removes the token only when the caller owns it. Someone else's or an unknown token is
 * `not_found`, which the controller answers exactly like a removal (FR-008).
 */
export class UnregisterDeviceCommandHandler
  implements ICommandHandler<UnregisterDeviceCommand, UnregisterDeviceResult>
{
  constructor(private readonly deps: UnregisterDeviceDependencies) {}

  async handle(command: UnregisterDeviceCommand): Promise<UnregisterDeviceResult> {
    const token = normalizeToken(command.token);
    if (!token) return { outcome: 'invalid_token' };

    if (!(await this.deps.devices.removeOwned(token, command.userId))) return { outcome: 'not_found' };
    this.deps.logger.info(
      { outcome: 'device_unregistered', userId: command.userId, tokenRef: this.deps.fingerprint.ref(token) },
      'Device unregistered',
    );
    return { outcome: 'removed' };
  }
}
