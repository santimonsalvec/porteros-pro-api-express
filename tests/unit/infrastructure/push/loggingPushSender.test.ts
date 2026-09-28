import { describe, expect, it } from 'vitest';
import { LoggingPushSender } from '../../../../src/infrastructure/push/loggingPushSender.js';
import { tokenRef } from '../../../../src/infrastructure/push/tokenRef.js';
import { RecordingDeviceLogger } from '../../../fakes/recordingDeviceLogger.js';

describe('LoggingPushSender', () => {
  it('logs what would be sent, by token reference only, and reports success', async () => {
    const logger = new RecordingDeviceLogger();
    const device = { token: 'secret-token', userId: 'user-a', platform: 'ios' as const, lastSeenAt: new Date() };

    const result = await new LoggingPushSender(logger).send(device, { title: 'Hola', body: 'Prueba', data: { type: 'test' } });

    expect(result).toEqual({ outcome: 'sent' });
    expect(logger.entries[0]!.entry).toEqual({
      outcome: 'push_sent',
      userId: 'user-a',
      platform: 'ios',
      tokenRef: tokenRef('secret-token'),
      title: 'Hola',
      dataKeys: ['type'],
    });
    expect(logger.serialized()).not.toContain('secret-token');
  });
});
