import { describe, expect, it } from 'vitest';
import { validatePushMessage } from '../../../../src/domain/devices/deviceRules.js';
import { adminCancelledMessage, bookingCancelledMessage } from '../../../../src/domain/notifications/outcomeMessages.js';

const match = { zoneName: 'Bello', cityName: 'Medellín', startsAt: new Date('2026-10-04T20:00:00.000Z'), timeZone: 'America/Bogota' };

describe('notices of an administrator cancellation (admin spec 006)', () => {
  it('tells the goalkeeper PorterosPRO cancelled their match and how much came back', () => {
    expect(bookingCancelledMessage(match, 'r-1', 'b-1', { amount: 7000, currency: 'COP' }, 'admin')).toEqual({
      title: 'Partido cancelado',
      body: 'PorterosPRO canceló tu partido en Bello · dom 4 oct, 3:00 p. m. Te devolvimos 7.000 COP.',
      data: { type: 'booking.cancelled', requestId: 'r-1', bookingId: 'b-1' },
    });
    expect(bookingCancelledMessage(match, 'r-1', 'b-1', null, 'admin').body).toBe('PorterosPRO canceló tu partido en Bello · dom 4 oct, 3:00 p. m.');
  });

  it('tells the client their whole match was cancelled when nothing is left', () => {
    expect(adminCancelledMessage(match, 'r-1', 'b-1', { remaining: 0 })).toEqual({
      title: 'Partido cancelado',
      body: 'PorterosPRO canceló tu partido en Bello · dom 4 oct, 3:00 p. m.',
      data: { type: 'booking.cancelled', requestId: 'r-1', bookingId: 'b-1' },
    });
  });

  it('tells the client one of their goalkeepers was cancelled when others remain', () => {
    expect(adminCancelledMessage(match, 'r-1', 'b-1', { remaining: 1 })).toEqual({
      title: 'Portero cancelado',
      body: 'PorterosPRO canceló uno de los porteros de tu partido en Bello · dom 4 oct, 3:00 p. m.',
      data: { type: 'booking.cancelled', requestId: 'r-1', bookingId: 'b-1' },
    });
  });

  it('produces valid push messages', () => {
    for (const message of [
      bookingCancelledMessage(match, 'r-1', 'b-1', { amount: 7000, currency: 'COP' }, 'admin'),
      adminCancelledMessage(match, 'r-1', 'b-1', { remaining: 0 }),
      adminCancelledMessage(match, 'r-1', 'b-1', { remaining: 2 }),
    ]) {
      expect(validatePushMessage(message)).toEqual({ ok: true });
    }
  });
});
