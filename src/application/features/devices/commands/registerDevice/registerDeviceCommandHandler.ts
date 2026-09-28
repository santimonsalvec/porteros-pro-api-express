import type { IClock } from '../../../../common/clock.js';
import type { ICommandHandler } from '../../../../common/mediator/types.js';
import { normalizeToken } from '../../../../../domain/devices/deviceRules.js';
import type { IDeviceLogger, IDeviceRepository, ITokenFingerprint } from '../../common/ports.js';
import { RegisterDeviceCommand, type RegisterDeviceResult } from './registerDeviceCommand.js';

export interface RegisterDeviceDependencies {
  devices: IDeviceRepository;
  clock: IClock;
  logger: IDeviceLogger;
  fingerprint: ITokenFingerprint;
  maxDevicesPerUser: number;
}

/**
 * Stores the token for the caller in one atomic write — new, refreshed, or moved from another
 * user (FR-003, FR-006) — then keeps the caller within the per-user limit (FR-005).
 */
export class RegisterDeviceCommandHandler implements ICommandHandler<RegisterDeviceCommand, RegisterDeviceResult> {
  constructor(private readonly deps: RegisterDeviceDependencies) {}

  async handle(command: RegisterDeviceCommand): Promise<RegisterDeviceResult> {
    const token = normalizeToken(command.token);
    if (!token) return { outcome: 'invalid_token' };

    const { userId, platform } = command;
    const tokenRef = this.deps.fingerprint.ref(token);
    const result = await this.deps.devices.upsert(token, userId, platform, this.deps.clock.now());
    switch (result.kind) {
      case 'registered':
        this.deps.logger.info({ outcome: 'device_registered', userId, platform, tokenRef }, 'Device registered');
        break;
      case 'refreshed':
        this.deps.logger.info({ outcome: 'device_refreshed', userId, platform, tokenRef }, 'Device refreshed');
        break;
      case 'transferred':
        this.deps.logger.info(
          { outcome: 'device_transferred', userId, previousUserId: result.previousUserId, platform, tokenRef },
          'Device moved to another user',
        );
        break;
    }

    const removed = await this.deps.devices.trimToLimit(userId, this.deps.maxDevicesPerUser);
    for (const device of removed) {
      this.deps.logger.info(
        {
          outcome: 'device_removed',
          reason: 'limit',
          userId,
          platform: device.platform,
          tokenRef: this.deps.fingerprint.ref(device.token),
        },
        'Device removed over the per-user limit',
      );
    }
    return { outcome: result.kind };
  }
}
