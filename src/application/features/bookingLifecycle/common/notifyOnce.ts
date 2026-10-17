import type { IClock } from '../../../common/clock.js';
import type { PushMessage } from '../../../../domain/devices/deviceRules.js';
import { resolveLanguage, type Language } from '../../../../domain/i18n/language.js';
import type { IIdGenerator } from '../../auth/common/ports.js';
import type { IPushNotifier } from '../../devices/common/ports.js';
import type { INotificationRepository } from '../../notifications/common/ports.js';
import type { IUserLanguages } from '../../users/common/userLanguages.js';

export interface NotifyOnceDependencies {
  notifications: INotificationRepository;
  pushNotifier: IPushNotifier;
  idGenerator: IIdGenerator;
  clock: IClock;
  /** The language each person chose (feature 032): the notice is worded in it. */
  userLanguages: IUserLanguages;
}

export interface NotifyOnceNotice {
  userId: string;
  /** The notice in the recipient's language: built once the language is known. */
  message: (language: Language) => PushMessage;
  dedupeKey: string;
  /** The caller's `Accept-Language`, used when the account has no language of its own. */
  requestLanguage?: Language | null;
}

/**
 * The inbox entry, then the push — once per `dedupeKey` (features 016, 018, 019; 020 reuses it).
 * Only the call that writes the entry pushes, so redeliveries and concurrent deliveries notify
 * once; the entry is kept even when the push fails. The text is in the recipient's language, then
 * the request's, then Spanish (feature 032); the entry and the push carry the same text. Returns
 * how many devices were reached, or null when the notice already existed.
 */
export async function notifyOnce(deps: NotifyOnceDependencies, notice: NotifyOnceNotice): Promise<number | null> {
  const { userId, dedupeKey } = notice;
  const language = resolveLanguage(await deps.userLanguages.languageOf(userId), notice.requestLanguage);
  const message = notice.message(language);
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
