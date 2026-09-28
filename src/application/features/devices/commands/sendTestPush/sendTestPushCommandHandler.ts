import type { IClock } from '../../../../common/clock.js';
import type { ICommandHandler } from '../../../../common/mediator/types.js';
import type { IPushNotifier, IRateLimiter } from '../../common/ports.js';
import { SendTestPushCommand, type SendTestPushResult } from './sendTestPushCommand.js';

export interface SendTestPushDependencies {
  notifier: IPushNotifier;
  limiter: IRateLimiter;
  clock: IClock;
  limitPerMinute: number;
}

/** Only ever reaches the caller's own devices, and at most `limitPerMinute` times (FR-020, FR-021). */
export class SendTestPushCommandHandler implements ICommandHandler<SendTestPushCommand, SendTestPushResult> {
  constructor(private readonly deps: SendTestPushDependencies) {}

  async handle(command: SendTestPushCommand): Promise<SendTestPushResult> {
    const now = this.deps.clock.now();
    const decision = this.deps.limiter.tryConsume(`test-push:${command.userId}`, this.deps.limitPerMinute, 60, now);
    if (!decision.allowed) return { outcome: 'rate_limited', retryAfterSeconds: decision.retryAfterSeconds };

    const sent = await this.deps.notifier.sendToUsers([command.userId], {
      title: 'PorterosPRO',
      body: 'Notificación de prueba: tus avisos están funcionando.',
      data: { type: 'test', sentAt: now.toISOString() },
    });
    return { outcome: 'sent', result: sent.perUser[command.userId]! };
  }
}
