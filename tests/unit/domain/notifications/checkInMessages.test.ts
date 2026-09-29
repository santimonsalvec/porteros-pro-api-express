import { describe, expect, it } from 'vitest';
import { validatePushMessage } from '../../../../src/domain/devices/deviceRules.js';
import {
  checkInLastCallMessage,
  checkInMissedMessage,
  checkInOpenMessage,
  goalkeeperArrivedMessage,
} from '../../../../src/domain/notifications/checkInMessages.js';

const match = { zoneName: 'Bello', cityName: 'Medellín', startsAt: new Date('2026-10-04T20:00:00.000Z'), timeZone: 'America/Bogota' };
const juan = { firstName: 'Juan', lastName: 'Pérez', whatsApp: '+57 300 1234567' };

describe('check-in messages (feature 020)', () => {
  it('tells the client the goalkeeper arrived', () => {
    expect(goalkeeperArrivedMessage(match, 'r-1', 'b-1')).toEqual({
      title: 'Tu portero llegó',
      body: 'Tu portero llegó al partido en Bello · dom 4 oct, 3:00 p. m.',
      data: { type: 'booking.goalkeeper_arrived', requestId: 'r-1', bookingId: 'b-1' },
    });
  });

  it('tells the client the goalkeeper has not checked in, with how to reach them', () => {
    expect(checkInMissedMessage(match, 'r-1', 'b-1', juan).body).toBe(
      'Tu portero Juan Pérez no ha confirmado su llegada al partido en Bello · dom 4 oct, 3:00 p. m. Escríbele: WhatsApp +57 300 1234567.',
    );
    expect(checkInMissedMessage(match, 'r-1', 'b-1', { firstName: null, lastName: null, whatsApp: null }).body).toBe(
      'Tu portero no ha confirmado su llegada al partido en Bello · dom 4 oct, 3:00 p. m.',
    );
    expect(checkInMissedMessage(match, 'r-1', 'b-1', null).data).toEqual({ type: 'booking.check_in_missed', requestId: 'r-1', bookingId: 'b-1' });
  });

  it('reminds the goalkeeper when the window opens and 10 minutes before it closes', () => {
    expect(checkInOpenMessage(match, 'r-1', 'b-1').body).toBe(
      'Ya puedes confirmar tu llegada al partido en Bello · dom 4 oct, 3:00 p. m. Tómate una foto en la cancha.',
    );
    expect(checkInLastCallMessage(match, 'r-1', 'b-1')).toMatchObject({
      title: 'Te quedan 10 minutos',
      body: 'Te quedan 10 minutos para confirmar tu llegada al partido en Bello · dom 4 oct, 3:00 p. m.',
      data: { type: 'booking.check_in_last_call' },
    });
  });

  it('never has a double period or a non-breaking space, and is a valid push', () => {
    for (const message of [
      goalkeeperArrivedMessage(match, 'r', 'b'),
      checkInMissedMessage(match, 'r', 'b', juan),
      checkInOpenMessage(match, 'r', 'b'),
      checkInLastCallMessage(match, 'r', 'b'),
    ]) {
      expect(message.body).not.toMatch(/\.\.| | /);
      expect(validatePushMessage(message)).toMatchObject({ ok: true });
    }
  });
});
