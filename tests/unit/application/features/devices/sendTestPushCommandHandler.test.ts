import { describe, expect, it, vi } from 'vitest';
import { SendTestPushCommand } from '../../../../../src/application/features/devices/commands/sendTestPush/sendTestPushCommand.js';
import { SendTestPushCommandHandler } from '../../../../../src/application/features/devices/commands/sendTestPush/sendTestPushCommandHandler.js';
import type { IPushNotifier } from '../../../../../src/application/features/devices/common/ports.js';
import { FixedClock } from '../../../../fakes/fakeClock.js';
import { FakeRateLimiter } from '../../../../fakes/fakeRateLimiter.js';

function harness() {
  const notifier = {
    sendToUsers: vi.fn().mockResolvedValue({
      perUser: { 'user-a': { reached: 2, removed: 0, failed: 0, noDevice: false } },
      totals: { reached: 2, removed: 0, failed: 0, usersWithoutDevice: 0 },
    }),
  } satisfies IPushNotifier;
  const limiter = new FakeRateLimiter();
  const clock = new FixedClock('2026-09-28T18:00:00.000Z');
  const handler = new SendTestPushCommandHandler({ notifier, limiter, clock, limitPerMinute: 5 });
  return { notifier, limiter, handler };
}

describe('SendTestPushCommandHandler', () => {
  it("sends a test push to the caller's devices only and returns their result", async () => {
    const { notifier, limiter, handler } = harness();

    const result = await handler.handle(new SendTestPushCommand('user-a'));

    expect(result).toEqual({ outcome: 'sent', result: { reached: 2, removed: 0, failed: 0, noDevice: false } });
    expect(notifier.sendToUsers).toHaveBeenCalledWith(['user-a'], {
      title: 'PorterosPRO',
      body: 'Notificación de prueba: tus avisos están funcionando.',
      data: { type: 'test', sentAt: '2026-09-28T18:00:00.000Z' },
    });
    expect(limiter.calls).toEqual([{ key: 'test-push:user-a', limit: 5, windowSeconds: 60 }]);
  });

  it('does not send when the caller is over the limit', async () => {
    const { notifier, limiter, handler } = harness();
    limiter.denyWith(42);

    expect(await handler.handle(new SendTestPushCommand('user-a'))).toEqual({ outcome: 'rate_limited', retryAfterSeconds: 42 });
    expect(notifier.sendToUsers).not.toHaveBeenCalled();
  });
});
