import { describe, expect, it } from 'vitest';
import { CHECK_IN_DEFAULTS, checkInWindow, distanceMeters, isCheckInOpen } from '../../../../src/domain/bookings/checkInWindow.js';

const start = new Date('2026-09-21T22:00:00.000Z');
const at = (iso: string) => new Date(iso);

describe('check-in window (feature 020)', () => {
  it('opens 30 minutes before and closes 15 after, inclusive, with the last call 10 minutes before the close', () => {
    const window = checkInWindow(start, CHECK_IN_DEFAULTS);

    expect(window).toEqual({
      opensAt: at('2026-09-21T21:30:00.000Z'),
      lastCallAt: at('2026-09-21T22:05:00.000Z'),
      closesAt: at('2026-09-21T22:15:00.000Z'),
    });
    expect(isCheckInOpen(window, at('2026-09-21T21:29:59.999Z'))).toBe(false);
    expect(isCheckInOpen(window, at('2026-09-21T21:30:00.000Z'))).toBe(true);
    expect(isCheckInOpen(window, at('2026-09-21T22:15:00.000Z'))).toBe(true);
    expect(isCheckInOpen(window, at('2026-09-21T22:15:00.001Z'))).toBe(false);
  });

  it('never puts the last call before the window opens', () => {
    const window = checkInWindow(start, { opensMinutesBefore: 1, closesMinutesAfter: 5 });

    expect(window.lastCallAt).toEqual(window.opensAt);
  });

  it('measures the distance to the pitch in whole meters', () => {
    const pitch = { latitude: 3.4516, longitude: -76.532 };

    expect(distanceMeters(pitch, pitch)).toBe(0);
    // 0.01° of latitude is about 1 112 m.
    const d = distanceMeters(pitch, { latitude: 3.4616, longitude: -76.532 });
    expect(d).toBeGreaterThan(1100);
    expect(d).toBeLessThan(1125);
  });
});
