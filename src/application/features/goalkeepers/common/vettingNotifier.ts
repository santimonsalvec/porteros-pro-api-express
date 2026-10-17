import { notifyOnce, type NotifyOnceDependencies } from '../../bookingLifecycle/common/notifyOnce.js';
import type { ILifecycleLogger } from '../../bookingLifecycle/common/ports.js';
import type { PushMessage } from '../../../../domain/devices/deviceRules.js';
import type { Language } from '../../../../domain/i18n/language.js';
import {
  VETTING_VALIDATED_TYPE,
  VETTING_VALIDATION_REJECTED_TYPE,
  VETTING_VERIFIED_TYPE,
  validatedMessage,
  validationRejectedMessage,
  verifiedMessage,
} from '../../../../domain/notifications/vettingMessages.js';

export interface VettingNotifierDependencies extends NotifyOnceDependencies {
  logger: ILifecycleLogger;
}

/**
 * Tells the goalkeeper about a decision on their validation or verification (admin spec 030,
 * research §11): inbox entry and push, once per history entry. Best effort, after the decision is
 * stored — a failure is logged and never undoes it. The outbox is not used because its events
 * belong to bookings.
 */
export class VettingNotifier {
  constructor(private readonly deps: VettingNotifierDependencies) {}

  validated(goalkeeperId: string, logEntryId: string): Promise<void> {
    return this.send(goalkeeperId, logEntryId, VETTING_VALIDATED_TYPE, validatedMessage);
  }

  validationRejected(goalkeeperId: string, logEntryId: string, reason: string): Promise<void> {
    return this.send(goalkeeperId, logEntryId, VETTING_VALIDATION_REJECTED_TYPE, (language) => validationRejectedMessage(language, reason));
  }

  verified(goalkeeperId: string, logEntryId: string): Promise<void> {
    return this.send(goalkeeperId, logEntryId, VETTING_VERIFIED_TYPE, verifiedMessage);
  }

  private async send(goalkeeperId: string, logEntryId: string, kind: string, message: (language: Language) => PushMessage): Promise<void> {
    try {
      await notifyOnce(this.deps, { userId: goalkeeperId, message, dedupeKey: `vetting:${logEntryId}` });
    } catch (error) {
      this.deps.logger.warn(
        { outcome: 'vetting_notice_failed', goalkeeperId, kind, error: error instanceof Error ? error.message : String(error) },
        'Vetting notice could not be sent',
      );
    }
  }
}
