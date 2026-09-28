import { describe, expect, it } from 'vitest';
import { UnregisterDeviceCommand } from '../../../../../src/application/features/devices/commands/unregisterDevice/unregisterDeviceCommand.js';
import { UnregisterDeviceCommandHandler } from '../../../../../src/application/features/devices/commands/unregisterDevice/unregisterDeviceCommandHandler.js';
import { sha256TokenFingerprint } from '../../../../../src/infrastructure/push/tokenRef.js';
import { FakeDeviceRepository } from '../../../../fakes/fakeDeviceRepository.js';
import { RecordingDeviceLogger } from '../../../../fakes/recordingDeviceLogger.js';

const seenAt = new Date('2026-09-28T18:00:00.000Z');

function harness() {
  const devices = new FakeDeviceRepository();
  devices.seed({ token: 'tok-b', userId: 'user-b', platform: 'ios', lastSeenAt: seenAt });
  const logger = new RecordingDeviceLogger();
  const handler = new UnregisterDeviceCommandHandler({ devices, logger, fingerprint: sha256TokenFingerprint });
  return { devices, logger, handler };
}

describe('UnregisterDeviceCommandHandler', () => {
  it("removes the caller's own token and logs it without the token", async () => {
    const { devices, logger, handler } = harness();

    expect(await handler.handle(new UnregisterDeviceCommand('user-b', 'tok-b'))).toEqual({ outcome: 'removed' });
    expect(devices.all()).toHaveLength(0);
    expect(logger.outcomes()).toEqual(['device_unregistered']);
    expect(logger.serialized()).not.toContain('"tok-b"');
  });

  it("leaves someone else's token in place", async () => {
    const { devices, logger, handler } = harness();

    expect(await handler.handle(new UnregisterDeviceCommand('user-a', 'tok-b'))).toEqual({ outcome: 'not_found' });
    expect(devices.all()).toHaveLength(1);
    expect(logger.entries).toHaveLength(0);
  });

  it('treats an unknown token and a repeat as not found', async () => {
    const { handler } = harness();

    expect(await handler.handle(new UnregisterDeviceCommand('user-b', 'unknown'))).toEqual({ outcome: 'not_found' });
    await handler.handle(new UnregisterDeviceCommand('user-b', 'tok-b'));
    expect(await handler.handle(new UnregisterDeviceCommand('user-b', 'tok-b'))).toEqual({ outcome: 'not_found' });
  });

  it('refuses a blank token', async () => {
    const { handler } = harness();

    expect(await handler.handle(new UnregisterDeviceCommand('user-b', ' '))).toEqual({ outcome: 'invalid_token' });
  });
});
