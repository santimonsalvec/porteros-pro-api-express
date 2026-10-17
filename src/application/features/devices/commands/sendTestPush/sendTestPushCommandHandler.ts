import type { IClock } from '../../../../common/clock.js';
import type { ICommandHandler } from '../../../../common/mediator/types.js';
import { resolveLanguage } from '../../../../../domain/i18n/language.js';
import { catalog } from '../../../../../domain/i18n/messages/catalog.js';
import type { IUserLanguages } from '../../../users/common/userLanguages.js';
import type { IPushNotifier, IRateLimiter } from '../../common/ports.js';
import { SendTestPushCommand, type SendTestPushResult } from './sendTestPushCommand.js';

export interface SendTestPushDependencies {
  notifier: IPushNotifier;
  limiter: IRateLimiter;
  clock: IClock;
  limitPerMinute: number;
  userLanguages: IUserLanguages;
}

/** Only ever reaches the caller's own devices, and at most `limitPerMinute` times (FR-020, FR-021). */
export class SendTestPushCommandHandler implements ICommandHandler<SendTestPushCommand, SendTestPushResult> {
  constructor(private readonly deps: SendTestPushDependencies) {}

  async handle(command: SendTestPushCommand): Promise<SendTestPushResult> {
    const now = this.deps.clock.now();
    const decision = this.deps.limiter.tryConsume(`test-push:${command.userId}`, this.deps.limitPerMinute, 60, now);
    if (!decision.allowed) return { outcome: 'rate_limited', retryAfterSeconds: decision.retryAfterSeconds };

    const language = resolveLanguage(await this.deps.userLanguages.languageOf(command.userId), command.requestLanguage);
    const sent = await this.deps.notifier.sendToUsers([command.userId], {
      ...catalog(language).testPush(),
      data: { type: 'test', sentAt: now.toISOString() },
    });
    return { outcome: 'sent', result: sent.perUser[command.userId]! };
  }
}
