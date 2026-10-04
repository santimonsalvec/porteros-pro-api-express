import { beforeEach, describe, expect, it } from 'vitest';
import { OfferWithdrawalHandler } from '../../../../../src/application/features/notifications/handlers/offerWithdrawalHandler.js';
import type { PushMessage } from '../../../../../src/domain/devices/deviceRules.js';
import type { DomainEvent, DomainEventType } from '../../../../../src/domain/events/domainEvent.js';
import { validatePushMessage } from '../../../../../src/domain/devices/deviceRules.js';
import { FakeNotificationRepository } from '../../../../fakes/fakeNotificationRepository.js';
import { FakeProcessedEventStore } from '../../../../fakes/fakeProcessedEventStore.js';

const now = new Date('2026-10-04T15:00:00.000Z');

let notifications: FakeNotificationRepository;
let sent: { userIds: readonly string[]; message: PushMessage }[];
let handler: OfferWithdrawalHandler;

async function offer(userId: string, requestId: string): Promise<void> {
  await notifications.createOfferIfAbsent({
    id: `${userId}-${requestId}`,
    userId,
    requestId,
    title: 'Partido disponible',
    body: 'Bello',
    data: { type: 'booking.available', requestId, bookingId: 'b-1' },
    createdAt: now,
  });
}

function event(type: DomainEventType, payload: unknown = {}, id = 'e-1'): DomainEvent {
  return { id, type, version: 1, occurredAt: now, bookingId: 'b-1', requestId: 'r-1', payload };
}

beforeEach(() => {
  notifications = new FakeNotificationRepository();
  sent = [];
  handler = new OfferWithdrawalHandler({
    notifications,
    pushNotifier: {
      sendToUsers: async (userIds, message) => {
        sent.push({ userIds, message });
        return { perUser: {}, totals: { reached: userIds.length, removed: 0, failed: 0, usersWithoutDevice: 0 } };
      },
    },
    processed: new FakeProcessedEventStore(),
    clock: { now: () => now },
    logger: { info: () => undefined },
  });
});

describe('OfferWithdrawalHandler', () => {
  it('tells everyone offered the request, silently, when it is cancelled', async () => {
    await offer('gk-1', 'r-1');
    await offer('gk-2', 'r-1');
    await offer('gk-3', 'r-other');

    await handler.handle(event('booking.cancelled'));

    expect(sent).toHaveLength(1);
    expect([...sent[0]!.userIds].sort()).toEqual(['gk-1', 'gk-2']);
    expect(sent[0]!.message).toEqual({ title: '', body: '', silent: true, data: { type: 'bookings.changed', requestId: 'r-1' } });
    expect(validatePushMessage(sent[0]!.message)).toEqual({ ok: true });
  });

  it('leaves out the goalkeeper who took it', async () => {
    await offer('gk-1', 'r-1');
    await offer('gk-2', 'r-1');

    await handler.handle(event('goalkeeper.assigned', { goalkeeperId: 'gk-1' }));

    expect(sent[0]!.userIds).toEqual(['gk-2']);
  });

  it('sends nothing when nobody was offered it, and once per event', async () => {
    await handler.handle(event('booking.expired'));
    expect(sent).toHaveLength(0);

    await offer('gk-1', 'r-1');
    await handler.handle(event('booking.expired', {}, 'e-2'));
    await handler.handle(event('booking.expired', {}, 'e-2'));
    expect(sent).toHaveLength(1);
  });
});
