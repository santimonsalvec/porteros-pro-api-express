import { describe, expect, it } from 'vitest';
import { PushNotifier } from '../../../../../src/application/features/devices/common/pushNotifier.js';
import type { PushMessage } from '../../../../../src/application/features/devices/common/ports.js';
import { sha256TokenFingerprint } from '../../../../../src/infrastructure/push/tokenRef.js';
import { FakeDeviceRepository } from '../../../../fakes/fakeDeviceRepository.js';
import { FakePushSender } from '../../../../fakes/fakePushSender.js';
import { RecordingDeviceLogger } from '../../../../fakes/recordingDeviceLogger.js';

const seenAt = new Date('2026-09-28T18:00:00.000Z');
const message: PushMessage = { title: 'PorterosPRO', body: 'Hay un partido disponible', data: { type: 'test' } };

function harness() {
  const devices = new FakeDeviceRepository();
  const sender = new FakePushSender();
  const logger = new RecordingDeviceLogger();
  const notifier = new PushNotifier({ devices, sender, logger, fingerprint: sha256TokenFingerprint });
  const seed = (userId: string, ...tokens: string[]) =>
    tokens.forEach((token) => devices.seed({ token, userId, platform: 'android', lastSeenAt: seenAt }));
  return { devices, sender, logger, notifier, seed };
}

describe('PushNotifier', () => {
  it('reaches every device, removes the invalid token and keeps the temporarily failed one', async () => {
    const { devices, sender, notifier, seed } = harness();
    seed('user-a', 'a-1', 'a-2');
    seed('user-b', 'b-1');
    sender.setOutcome('a-2', 'invalid');
    sender.setOutcome('b-1', 'failed');

    const result = await notifier.sendToUsers(['user-a', 'user-b'], message);

    expect(sender.calls).toHaveLength(3);
    expect(result.perUser).toEqual({
      'user-a': { reached: 1, removed: 1, failed: 0, noDevice: false },
      'user-b': { reached: 0, removed: 0, failed: 1, noDevice: false },
    });
    expect(result.totals).toEqual({ reached: 1, removed: 1, failed: 1, usersWithoutDevice: 0 });
    expect(devices.all().map((device) => device.token).sort()).toEqual(['a-1', 'b-1']);
  });

  it('reports a user without devices, which is not an error', async () => {
    const { sender, notifier } = harness();

    const result = await notifier.sendToUsers(['user-c'], message);

    expect(result.perUser['user-c']).toEqual({ reached: 0, removed: 0, failed: 0, noDevice: true });
    expect(result.totals.usersWithoutDevice).toBe(1);
    expect(sender.calls).toHaveLength(0);
  });

  it('sends once per device when a user is listed twice', async () => {
    const { sender, notifier, seed } = harness();
    seed('user-a', 'a-1');

    await notifier.sendToUsers(['user-a', 'user-a'], message);

    expect(sender.calls).toHaveLength(1);
  });

  it('stops after a fatal answer, counting the rest as failed and removing nothing', async () => {
    const { devices, sender, logger, seed } = harness();
    seed('user-a', 'a-1', 'a-2', 'a-3');
    sender.setOutcome('a-1', 'fatal');
    const notifier = new PushNotifier({ devices, sender, logger, fingerprint: sha256TokenFingerprint, concurrency: 1 });

    const result = await notifier.sendToUsers(['user-a'], message);

    expect(sender.calls).toHaveLength(1);
    expect(result.perUser['user-a']).toEqual({ reached: 0, removed: 0, failed: 3, noDevice: false });
    expect(devices.all()).toHaveLength(3);
    expect(logger.outcomes()).toContain('push_send_fatal');
  });

  it('sends nothing for an invalid message', async () => {
    const { sender, logger, notifier, seed } = harness();
    seed('user-a', 'a-1');

    const result = await notifier.sendToUsers(['user-a'], { ...message, data: {} });

    expect(sender.calls).toHaveLength(0);
    expect(result.perUser['user-a']).toMatchObject({ failed: 1, noDevice: false });
    expect(logger.outcomes()).toEqual(['push_message_invalid']);
  });

  it('never throws, even when the sender breaks its contract', async () => {
    const { sender, notifier, seed } = harness();
    seed('user-a', 'a-1', 'a-2');
    sender.throwOn('a-1');

    const result = await notifier.sendToUsers(['user-a'], message);

    expect(result.perUser['user-a']).toEqual({ reached: 1, removed: 0, failed: 1, noDevice: false });
  });

  it('returns an all-failed result when the lookup fails', async () => {
    const { devices, logger, notifier } = harness();
    devices.findByUserIds = async () => {
      throw new Error('mongo down');
    };

    const result = await notifier.sendToUsers(['user-a'], message);

    expect(result.perUser['user-a']).toEqual({ reached: 0, removed: 0, failed: 0, noDevice: false });
    expect(logger.outcomes()).toEqual(['push_notifier_failed']);
  });

  it('sends to 50 users with 3 devices each, at most 10 at a time', async () => {
    const { sender, notifier, seed } = harness();
    const users = Array.from({ length: 50 }, (_, index) => `user-${index}`);
    users.forEach((userId) => seed(userId, `${userId}-1`, `${userId}-2`, `${userId}-3`));
    sender.delayEachMs(1);

    const result = await notifier.sendToUsers(users, message);

    expect(sender.calls).toHaveLength(150);
    expect(sender.maxInFlight).toBe(10);
    expect(result.totals.reached).toBe(150);
  });

  it('never logs a raw token', async () => {
    const { sender, logger, notifier, seed } = harness();
    seed('user-a', 'secret-token-1', 'secret-token-2', 'secret-token-3');
    sender.setOutcome('secret-token-1', 'invalid');
    sender.setOutcome('secret-token-2', 'failed');
    sender.setOutcome('secret-token-3', 'fatal');

    await notifier.sendToUsers(['user-a'], message);

    expect(logger.entries.length).toBeGreaterThan(0);
    expect(logger.serialized()).not.toContain('secret-token');
  });
});
