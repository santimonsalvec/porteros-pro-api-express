import { describe, expect, it } from 'vitest';
import { RegisterDeviceCommand } from '../../../../../src/application/features/devices/commands/registerDevice/registerDeviceCommand.js';
import { RegisterDeviceCommandHandler } from '../../../../../src/application/features/devices/commands/registerDevice/registerDeviceCommandHandler.js';
import { sha256TokenFingerprint } from '../../../../../src/infrastructure/push/tokenRef.js';
import { FixedClock } from '../../../../fakes/fakeClock.js';
import { FakeDeviceRepository } from '../../../../fakes/fakeDeviceRepository.js';
import { RecordingDeviceLogger } from '../../../../fakes/recordingDeviceLogger.js';

const TOKEN = 'fcm-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

function harness(maxDevicesPerUser = 10) {
  const devices = new FakeDeviceRepository();
  const clock = new FixedClock('2026-09-28T18:00:00.000Z');
  const logger = new RecordingDeviceLogger();
  const handler = new RegisterDeviceCommandHandler({ devices, clock, logger, fingerprint: sha256TokenFingerprint, maxDevicesPerUser });
  return { devices, clock, logger, handler };
}

describe('RegisterDeviceCommandHandler', () => {
  it('registers a new token for the caller', async () => {
    const { devices, handler, logger } = harness();

    expect(await handler.handle(new RegisterDeviceCommand('user-a', TOKEN, 'android'))).toEqual({ outcome: 'registered' });
    expect(devices.all()).toMatchObject([{ token: TOKEN, userId: 'user-a', platform: 'android' }]);
    expect(logger.outcomes()).toEqual(['device_registered']);
  });

  it('refreshes the same token for the same user without a second device', async () => {
    const { devices, clock, handler } = harness();
    await handler.handle(new RegisterDeviceCommand('user-a', TOKEN, 'android'));
    clock.advance(60_000);

    expect(await handler.handle(new RegisterDeviceCommand('user-a', TOKEN, 'ios'))).toEqual({ outcome: 'refreshed' });
    expect(devices.all()).toHaveLength(1);
    expect(devices.all()[0]).toMatchObject({ platform: 'ios', lastSeenAt: new Date('2026-09-28T18:01:00.000Z') });
  });

  it('renews a device about to go stale when it registers again', async () => {
    const { devices, handler } = harness();
    devices.seed({ token: TOKEN, userId: 'user-a', platform: 'android', lastSeenAt: new Date('2026-07-31T18:00:00.000Z') });

    await handler.handle(new RegisterDeviceCommand('user-a', TOKEN, 'android'));

    expect(devices.all()[0]!.lastSeenAt).toEqual(new Date('2026-09-28T18:00:00.000Z'));
  });

  it('moves a token registered by another user, logging the previous owner', async () => {
    const { devices, handler, logger } = harness();
    await handler.handle(new RegisterDeviceCommand('user-a', TOKEN, 'android'));

    expect(await handler.handle(new RegisterDeviceCommand('user-b', TOKEN, 'android'))).toEqual({ outcome: 'transferred' });
    expect(await devices.findByUserIds(['user-a'])).toEqual([]);
    expect(await devices.findByUserIds(['user-b'])).toHaveLength(1);
    expect(logger.entries.at(-1)!.entry).toMatchObject({ outcome: 'device_transferred', userId: 'user-b', previousUserId: 'user-a' });
  });

  it('refuses a blank or oversized token and stores nothing', async () => {
    const { devices, handler } = harness();

    expect(await handler.handle(new RegisterDeviceCommand('user-a', '   ', 'android'))).toEqual({ outcome: 'invalid_token' });
    expect(await handler.handle(new RegisterDeviceCommand('user-a', 'x'.repeat(4097), 'android'))).toEqual({ outcome: 'invalid_token' });
    expect(devices.all()).toHaveLength(0);
  });

  it('keeps the user within the limit by removing the least recently seen device', async () => {
    const { devices, clock, handler, logger } = harness(2);
    for (const token of ['tok-1', 'tok-2', 'tok-3']) {
      await handler.handle(new RegisterDeviceCommand('user-a', token, 'android'));
      clock.advance(1000);
    }

    expect(devices.all().map((device) => device.token).sort()).toEqual(['tok-2', 'tok-3']);
    expect(logger.entries.at(-1)!.entry).toMatchObject({ outcome: 'device_removed', reason: 'limit', userId: 'user-a' });
  });

  it('never logs the raw token', async () => {
    const { handler, logger } = harness(1);
    await handler.handle(new RegisterDeviceCommand('user-a', TOKEN, 'android'));
    await handler.handle(new RegisterDeviceCommand('user-b', TOKEN, 'android'));
    await handler.handle(new RegisterDeviceCommand('user-b', `${TOKEN}-2`, 'ios'));

    expect(logger.serialized()).not.toContain(TOKEN);
    expect(logger.entries[0]!.entry.tokenRef).toBe(sha256TokenFingerprint.ref(TOKEN));
  });
});
