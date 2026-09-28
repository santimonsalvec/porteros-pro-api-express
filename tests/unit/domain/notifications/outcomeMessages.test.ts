import { describe, expect, it } from 'vitest';
import { validatePushMessage } from '../../../../src/domain/devices/deviceRules.js';
import {
  bookingCancelledMessage,
  formatAmount,
  requestCancelledMessage,
  requestExpiredMessage,
  requestPartiallyExpiredMessage,
} from '../../../../src/domain/notifications/outcomeMessages.js';

const match = { zoneName: 'Bello', cityName: 'Medellín', startsAt: new Date('2026-10-04T20:00:00.000Z'), timeZone: 'America/Bogota' };

describe('outcome messages (feature 016)', () => {
  it('tells the client no goalkeeper was found, or only some', () => {
    expect(requestExpiredMessage(match, 'r-1')).toEqual({
      title: 'Sin portero para tu partido',
      body: 'No logramos hallar un portero para tu partido en Bello · dom 4 oct, 3:00 p. m.',
      data: { type: 'request.expired', requestId: 'r-1' },
    });
    expect(requestPartiallyExpiredMessage(match, 'r-1', 1, 2).body).toBe('Conseguimos 1 de 2 porteros para tu partido en Bello · dom 4 oct, 3:00 p. m.');
  });

  it('tells the client their "cancel all" request was cancelled', () => {
    expect(requestCancelledMessage(match, 'r-1')).toMatchObject({
      title: 'Solicitud cancelada',
      body: 'Cancelamos tu solicitud en Bello · dom 4 oct, 3:00 p. m.: no se confirmaron todos los porteros a tiempo.',
      data: { type: 'request.cancelled', requestId: 'r-1' },
    });
  });

  it('tells the goalkeeper the match was cancelled and how much came back', () => {
    expect(bookingCancelledMessage(match, 'r-1', 'b-1', { amount: 7000, currency: 'COP' })).toEqual({
      title: 'Partido cancelado',
      body: 'Se canceló tu partido en Bello · dom 4 oct, 3:00 p. m. Te devolvimos 7.000 COP.',
      data: { type: 'booking.cancelled', requestId: 'r-1', bookingId: 'b-1' },
    });
    expect(bookingCancelledMessage({ ...match, zoneName: null }, 'r-1', 'b-1', null).body).toBe('Se canceló tu partido en Medellín · dom 4 oct, 3:00 p. m.');
  });

  it('says the client cancelled, when they did (feature 017)', () => {
    expect(bookingCancelledMessage(match, 'r-1', 'b-1', { amount: 7000, currency: 'COP' }, 'client').body).toBe(
      'El cliente canceló tu partido en Bello · dom 4 oct, 3:00 p. m. Te devolvimos 7.000 COP.',
    );
  });

  it('formats amounts with the Colombian thousands separator', () => {
    expect(formatAmount(7000, 'COP')).toBe('7.000 COP');
    expect(formatAmount(120000, 'COP')).toBe('120.000 COP');
  });

  it('produces valid push messages', () => {
    for (const message of [
      requestExpiredMessage(match, 'r-1'),
      requestPartiallyExpiredMessage(match, 'r-1', 1, 2),
      requestCancelledMessage(match, 'r-1'),
      bookingCancelledMessage(match, 'r-1', 'b-1', { amount: 7000, currency: 'COP' }),
    ]) {
      expect(validatePushMessage(message)).toEqual({ ok: true });
    }
  });
});
