import type {
  Device,
  IDeviceLogger,
  IPushSender,
  PushMessage,
  PushSendOutcome,
} from '../../application/features/devices/common/ports.js';
import { tokenRef } from './tokenRef.js';

/** `PUSH_MODE=log` (research §11): logs what would be sent and reports success. */
export class LoggingPushSender implements IPushSender {
  constructor(private readonly logger: Pick<IDeviceLogger, 'info'>) {}

  async send(device: Device, message: PushMessage): Promise<{ outcome: PushSendOutcome }> {
    this.logger.info(
      {
        outcome: 'push_sent',
        userId: device.userId,
        platform: device.platform,
        tokenRef: tokenRef(device.token),
        title: message.title,
        dataKeys: Object.keys(message.data),
      },
      'Push logged (PUSH_MODE=log)',
    );
    return { outcome: 'sent' };
  }
}
