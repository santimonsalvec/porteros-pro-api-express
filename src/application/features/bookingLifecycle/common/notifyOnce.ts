import type { IClock } from '../../../common/clock.js';
import type { PushMessage } from '../../../../domain/devices/deviceRules.js';
import type { IIdGenerator } from '../../auth/common/ports.js';
import type { IPushNotifier } from '../../devices/common/ports.js';
import type { INotificationRepository } from '../../notifications/common/ports.js';

export interface NotifyOnceDependencies {
  notifications: INotificationRepository;
  pushNotifier: IPushNotifier;
  idGenerator: IIdGenerator;
  clock: IClock;
}

/**
 * The inbox entry, then the push — once per `dedupeKey` (features 016, 018, 019; 020 reuses it).
 * Only the call that writes the entry pushes, so redeliveries and concurrent deliveries notify
 * once; the entry is kept even when the push fails. Returns how many devices were reached, or
 * null when the notice already existed.
 */
export async function notifyOnce(
  deps: NotifyOnceDependencies,
  notice: { userId: string; message: PushMessage; dedupeKey: string },
): Promise<number | null> {
  const { userId, message, dedupeKey } = notice;
  const created = await deps.notifications.createIfAbsent({
    id: deps.idGenerator.newId(),
    userId,
    type: message.data.type!,
    title: message.title,
    body: message.body,
    data: message.data,
    createdAt: deps.clock.now(),
    dedupeKey,
  });
  if (!created) return null;
  const result = await deps.pushNotifier.sendToUsers([userId], message);
  return result.totals.reached;
}
