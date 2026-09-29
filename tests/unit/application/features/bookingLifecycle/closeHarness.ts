import { User } from '../../../../../src/domain/users/user.js';
import { lifecycleHarness } from './lifecycleHarness.js';

const minutes = (n: number) => n * 60_000;

/**
 * Feature 021: `g` holds a Bello booking of client-a starting in 2 hours (90 minutes long). `close()`
 * moves to the end and completes it; `at(m)` sets the clock m minutes after the end.
 */
export async function closeHarness(count: 1 | 2 = 1) {
  const h = lifecycleHarness();
  for (const [id, first] of [['client-a', 'Ana'], ['g', 'Juan'], ['g2', 'Pedro']] as const) {
    const user = User.createFromExternalIdentity({ id, email: `${id}@example.com`, displayName: null, provider: 'google', subject: id });
    user.completeProfile(first, 'Ruiz', '+57', '3001234567');
    h.users.seed(user);
  }
  const { request, bookings } = h.match('r1', 2, count);
  await h.acceptAndPay(bookings[0]!, 'g');
  const booking = bookings[0]!;
  const at = (minutesAfterEnd: number) => h.clock.set(new Date(booking.endsAt.getTime() + minutes(minutesAfterEnd)));
  const close = async () => {
    at(0);
    await h.completionJob.run(h.clock.now());
  };
  const checkInNow = async () => {
    h.clock.set(new Date(booking.startsAt.getTime() - minutes(5)));
    await h.checkIn(booking.id, 'g', h.photo('g'));
  };
  const settle = () => h.noShowJob.run(h.clock.now());
  return { ...h, request, bookings, booking, at, close, checkInNow, settle };
}
