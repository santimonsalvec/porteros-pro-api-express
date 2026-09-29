import { describe, expect, it, vi } from 'vitest';
import { User } from '../../../../../src/domain/users/user.js';
import { lifecycleHarness } from './lifecycleHarness.js';

const minutes = (n: number) => n * 60_000;

function harness() {
  const h = lifecycleHarness();
  for (const [id, first, phone] of [['client-a', 'Ana', '3101112233'], ['gk-1', 'Juan', '3001112233'], ['gk-2', 'Pedro', '3004445566']] as const) {
    const user = User.createFromExternalIdentity({ id, email: `${id}@example.com`, displayName: null, provider: 'google', subject: id });
    user.completeProfile(first, 'Ruiz', '+57', phone);
    h.users.seed(user);
  }
  const of = (userId: string, type: string) => h.notifications.all().filter((item) => item.userId === userId && item.type === type);
  const run = () => h.contactsRevealJob.run(h.clock.now());
  return { ...h, of, run };
}

describe('ContactsRevealJob — US4: both sides are told one hour before', () => {
  it('tells the client who their goalkeepers are and each goalkeeper who the client is, once', async () => {
    const h = harness();
    const { request, bookings } = h.match('r1', 3, 2); // starts in 3 h: visible in 2 h
    h.assign(bookings[0]!, 'gk-1');
    h.assign(bookings[1]!, 'gk-2');

    h.clock.advance(minutes(119));
    await h.run();
    expect(h.notifications.all()).toHaveLength(0);

    h.clock.advance(minutes(1));
    expect(await h.run()).toBe('1 revealed, 0 without goalkeepers, 3 notices, 0 failed');
    expect(h.of('client-a', 'request.contacts_visible')).toMatchObject([
      { body: expect.stringContaining('Juan Ruiz · WhatsApp +57 3001112233 y Pedro Ruiz · WhatsApp +57 3004445566'), dedupeKey: 'contacts-visible:r1' },
    ]);
    expect(h.of('gk-1', 'booking.client_contact_visible')).toMatchObject([
      { body: expect.stringContaining('Ana Ruiz · WhatsApp +57 3101112233'), data: { bookingId: bookings[0]!.id }, dedupeKey: `client-contact-visible:${bookings[0]!.id}` },
    ]);
    expect(h.of('gk-2', 'booking.client_contact_visible')).toHaveLength(1);
    expect(h.request(request.id).contactsRevealedAt).toEqual(h.clock.now());

    await h.run();
    expect(h.notifications.all()).toHaveLength(3);
  });

  it('leaves out bookings taken in the last hour: their notices already named them', async () => {
    const h = harness();
    const { bookings } = h.match('r1', 3, 2);
    h.assign(bookings[0]!, 'gk-1');
    h.clock.advance(minutes(130)); // start − 50: gk-2 takes the other one now
    h.assign(bookings[1]!, 'gk-2');

    await h.run();

    expect(h.of('client-a', 'request.contacts_visible')[0]!.body).not.toContain('Pedro');
    expect(h.of('gk-2', 'booking.client_contact_visible')).toHaveLength(0);
    expect(h.of('gk-1', 'booking.client_contact_visible')).toHaveLength(1);
  });

  it('sends nothing without assigned bookings, and marks the request anyway', async () => {
    const h = harness();
    h.match('r1', 3, 2);
    h.clock.advance(minutes(120));

    expect(await h.run()).toBe('0 revealed, 1 without goalkeepers, 0 notices, 0 failed');
    expect(h.notifications.all()).toHaveLength(0);
    expect(h.request('r1').contactsRevealedAt).not.toBeNull();
  });

  it('sends nothing for a "cancel all" request cancelled at the same instant (cancel all runs first)', async () => {
    const h = harness();
    const { bookings } = h.match('r1', 3, 2, 'cancel_all');
    await h.acceptAndPay(bookings[0]!, 'gk-1');
    h.clock.advance(minutes(120));

    await h.cancelAllJob.run(h.clock.now());
    await h.run();

    expect(h.of('client-a', 'request.contacts_visible')).toHaveLength(0);
    expect(h.of('gk-1', 'booking.client_contact_visible')).toHaveLength(0);
  });

  it('sends nothing once the match has started', async () => {
    const h = harness();
    const { bookings } = h.match('r1', 3, 1);
    h.assign(bookings[0]!, 'gk-1');
    h.clock.advance(minutes(181));

    await h.run();

    expect(h.notifications.all()).toHaveLength(0);
  });

  it('keeps going when one request fails', async () => {
    const h = harness();
    const a = h.match('r1', 3, 1).bookings[0]!;
    const b = h.match('r2', 3.5, 1).bookings[0]!;
    h.assign(a, 'gk-1');
    h.assign(b, 'gk-2');
    h.clock.advance(minutes(150));
    const original = h.bookingRepository.findByRequestIds.bind(h.bookingRepository);
    vi.spyOn(h.bookingRepository, 'findByRequestIds').mockImplementation(async (ids) => {
      if (ids.includes('r1')) throw new Error('boom');
      return original(ids);
    });

    expect(await h.run()).toBe('1 revealed, 0 without goalkeepers, 2 notices, 1 failed');
    expect(h.request('r1').contactsRevealedAt).toBeNull();
    expect(h.request('r2').contactsRevealedAt).not.toBeNull();
  });
});
