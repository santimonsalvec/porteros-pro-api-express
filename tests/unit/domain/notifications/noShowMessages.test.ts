import { describe, expect, it } from 'vitest';
import { validatePushMessage } from '../../../../src/domain/devices/deviceRules.js';
import { noShowMessage } from '../../../../src/domain/notifications/noShowMessages.js';

const match = { zoneName: 'Bello', cityName: 'Medellín', startsAt: new Date('2026-10-04T20:00:00.000Z'), timeZone: 'America/Bogota' };

describe('no-show message (feature 021)', () => {
  it('tells the goalkeeper the no-show and until when they are suspended', () => {
    const message = noShowMessage(match, 'r-1', 'b-1', new Date('2026-10-07T23:00:00.000Z'));

    expect(message).toEqual({
      title: 'Inasistencia registrada',
      body: 'No confirmaste tu llegada al partido en Bello · dom 4 oct, 3:00 p. m. y quedó registrado como inasistencia. Quedaste suspendido hasta el mié 7 oct, 6:00 p. m.',
      data: { type: 'goalkeeper.no_show', requestId: 'r-1', bookingId: 'b-1' },
    });
    expect(message.body).not.toMatch(/\.\.| | /);
    expect(validatePushMessage(message)).toMatchObject({ ok: true });
    expect(noShowMessage(match, 'r-1', 'b-1', null).body).toMatch(/inasistencia\.$/);
  });
});
