import { validatePushMessage, type PushMessage } from '../../../../domain/devices/deviceRules.js';
import type {
  Device,
  IDeviceLogger,
  IDeviceRepository,
  IPushNotifier,
  IPushSender,
  ITokenFingerprint,
  PushSendOutcome,
  PushSendResult,
  UserPushResult,
} from './ports.js';
import { runWithConcurrency } from './runWithConcurrency.js';

export interface PushNotifierDependencies {
  devices: IDeviceRepository;
  sender: IPushSender;
  logger: IDeviceLogger;
  fingerprint: ITokenFingerprint;
  /** Sends in flight at once (research §7). */
  concurrency?: number;
  /** Per-send timeout, so one slow token never holds the whole call. */
  timeoutMs?: number;
}

type DeviceOutcome = PushSendOutcome | 'skipped';

/**
 * Reaches a set of users on every device they have (FR-011): sends in parallel, removes the
 * tokens the push service condemns (FR-012) and reports per user (FR-014). Never throws: any
 * unexpected failure becomes an all-failed result (FR-015).
 */
export class PushNotifier implements IPushNotifier {
  private readonly concurrency: number;
  private readonly timeoutMs: number;

  constructor(private readonly deps: PushNotifierDependencies) {
    this.concurrency = deps.concurrency ?? 10;
    this.timeoutMs = deps.timeoutMs ?? 5000;
  }

  async sendToUsers(userIds: readonly string[], message: PushMessage): Promise<PushSendResult> {
    const users = [...new Set(userIds)];
    let devices: Device[] | null = null;
    try {
      devices = await this.deps.devices.findByUserIds(users);
      const validation = validatePushMessage(message);
      if (!validation.ok) {
        this.deps.logger.error(
          { outcome: 'push_message_invalid', reason: validation.reason, type: message.data.type },
          'Push message rejected before sending',
        );
        return summarize(users, devices, () => 'failed');
      }

      const outcomes = await this.sendAll(devices, message);
      await this.removeInvalid(devices, outcomes);
      return summarize(users, devices, (index) => outcomes[index]!);
    } catch (err) {
      this.deps.logger.error({ outcome: 'push_notifier_failed', err }, 'Push notification failed');
      // Without the lookup nothing is known about the users' devices: none is claimed.
      return devices ? summarize(users, devices, () => 'failed') : summarize(users, [], () => 'failed', false);
    }
  }

  private async sendAll(devices: readonly Device[], message: PushMessage): Promise<DeviceOutcome[]> {
    let fatal = false;
    return runWithConcurrency(devices, this.concurrency, async (device) => {
      // Our own credentials failed: every other send would fail the same way.
      if (fatal) return 'skipped';
      const tokenRef = this.deps.fingerprint.ref(device.token);
      let outcome: PushSendOutcome;
      let reason: string | undefined;
      try {
        ({ outcome, reason } = await this.deps.sender.send(device, message, AbortSignal.timeout(this.timeoutMs)));
      } catch (err) {
        outcome = 'failed';
        reason = err instanceof Error ? err.message : 'sender_threw';
      }
      if (outcome === 'fatal' && !fatal) {
        fatal = true;
        this.deps.logger.error(
          { outcome: 'push_send_fatal', userId: device.userId, tokenRef, reason },
          'Push service refused our credentials; remaining sends skipped',
        );
      } else if (outcome === 'failed') {
        this.deps.logger.warn(
          { outcome: 'push_send_failed', userId: device.userId, tokenRef, reason },
          'Push send failed; device kept',
        );
      }
      return outcome;
    });
  }

  private async removeInvalid(devices: readonly Device[], outcomes: readonly DeviceOutcome[]): Promise<void> {
    const invalid = devices.filter((_, index) => outcomes[index] === 'invalid');
    if (invalid.length === 0) return;
    await this.deps.devices.removeByTokens(invalid.map((device) => device.token));
    for (const device of invalid) {
      this.deps.logger.info(
        {
          outcome: 'device_removed',
          reason: 'invalid',
          userId: device.userId,
          platform: device.platform,
          tokenRef: this.deps.fingerprint.ref(device.token),
        },
        'Device removed: the push service reports its token invalid',
      );
    }
  }
}

function summarize(
  users: readonly string[],
  devices: readonly Device[],
  outcomeOf: (index: number) => DeviceOutcome,
  devicesKnown = true,
): PushSendResult {
  const perUser: Record<string, UserPushResult> = {};
  for (const userId of users) perUser[userId] = { reached: 0, removed: 0, failed: 0, noDevice: devicesKnown };
  devices.forEach((device, index) => {
    const entry = perUser[device.userId];
    if (!entry) return;
    entry.noDevice = false;
    const outcome = outcomeOf(index);
    if (outcome === 'sent') entry.reached += 1;
    else if (outcome === 'invalid') entry.removed += 1;
    else entry.failed += 1;
  });
  const entries = Object.values(perUser);
  return {
    perUser,
    totals: {
      reached: sum(entries, 'reached'),
      removed: sum(entries, 'removed'),
      failed: sum(entries, 'failed'),
      usersWithoutDevice: entries.filter((entry) => entry.noDevice).length,
    },
  };
}

function sum(entries: readonly UserPushResult[], key: 'reached' | 'removed' | 'failed'): number {
  return entries.reduce((total, entry) => total + entry[key], 0);
}
