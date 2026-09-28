import { describe, expect, it } from 'vitest';
import { validatePushMessage } from '../../../../src/domain/devices/deviceRules.js';
import { goalkeeperSuspendedMessage, goalkeeperWithdrewMessage } from '../../../../src/domain/notifications/withdrawalMessages.js';

const match = { zoneName: 'Bello', cityName: 'Medellín', startsAt: new Date('2026-10-04T20:00:00.000Z'), timeZone: 'America/Bogota' };

describe('withdrawal messages (feature 018)', () => {
  it('tells the client another goalkeeper is being searched', () => {
    expect(goalkeeperWithdrewMessage(match, 'r-1', 'b-1', true)).toEqual({
      title: 'Tu portero se retiró',
      body: 'Tu portero se retiró del partido en Bello · dom 4 oct, 3:00 p. m. Ya estamos buscando otro portero.',
      data: { type: 'booking.goalkeeper_withdrew', requestId: 'r-1', bookingId: 'b-1' },
    });
  });

  it('tells the client when no replacement could be searched', () => {
    expect(goalkeeperWithdrewMessage(match, 'r-1', 'b-1', false).body).toBe(
      'Tu portero se retiró del partido en Bello · dom 4 oct, 3:00 p. m. No alcanzamos a buscar otro portero.',
    );
  });

  it('tells the goalkeeper until when they are suspended, in local time', () => {
    const message = goalkeeperSuspendedMessage(new Date('2026-10-07T18:30:00.000Z'), 'America/Bogota', 'r-1', 'b-1');

    expect(message.body).toBe(
      'Quedaste suspendido hasta el mié 7 oct, 1:30 p. m. por retirarte de un partido. Mientras tanto no verás partidos ni recibirás ofertas.',
    );
    expect(message.data).toEqual({ type: 'goalkeeper.suspended', requestId: 'r-1', bookingId: 'b-1', suspendedUntil: '2026-10-07T18:30:00.000Z' });
  });

  it('never has a double period or a non-breaking space, and is a valid push', () => {
    for (const message of [
      goalkeeperWithdrewMessage(match, 'r-1', 'b-1', true),
      goalkeeperWithdrewMessage(match, 'r-1', 'b-1', false),
      goalkeeperSuspendedMessage(new Date('2026-10-07T18:30:00.000Z'), 'America/Bogota', 'r-1', 'b-1'),
    ]) {
      expect(message.body).not.toMatch(/\.\.| | /);
      expect(validatePushMessage(message)).toMatchObject({ ok: true });
    }
  });
});
