import { describe, expect, it } from 'vitest';
import { validatePushMessage } from '../../../../src/domain/devices/deviceRules.js';
import {
  clientContactVisibleMessage,
  contactsVisibleMessage,
  goalkeeperAssignedMessage,
  requestCompleteMessage,
} from '../../../../src/domain/notifications/assignmentMessages.js';

const match = { zoneName: 'Bello', cityName: 'Medellín', startsAt: new Date('2026-10-04T20:00:00.000Z'), timeZone: 'America/Bogota' };
const juan = { firstName: 'Juan', lastName: 'Pérez', whatsApp: '+57 300 1234567' };
const pedro = { firstName: 'Pedro', lastName: 'Gómez', whatsApp: null };
const ana = { firstName: 'Ana', lastName: 'Ruiz', whatsApp: '+57 310 7654321' };
const nameless = { firstName: null, lastName: null, whatsApp: null };

describe('assignment messages (feature 019)', () => {
  it('tells the client a goalkeeper took their match, without naming them before the last hour', () => {
    expect(goalkeeperAssignedMessage(match, 'r-1', 'b-1', { replacement: false, contact: null })).toEqual({
      title: 'Portero confirmado',
      body: 'Un portero tomó tu partido en Bello · dom 4 oct, 3:00 p. m. Seguimos buscando el otro.',
      data: { type: 'booking.goalkeeper_assigned', requestId: 'r-1', bookingId: 'b-1' },
    });
    expect(goalkeeperAssignedMessage(match, 'r-1', 'b-1', { replacement: true, contact: null }).body).toBe(
      'Encontramos otro portero para tu partido en Bello · dom 4 oct, 3:00 p. m. Seguimos buscando el otro.',
    );
    expect(goalkeeperAssignedMessage(match, 'r-1', 'b-1', { replacement: false, contact: juan }).body).toBe(
      'Un portero tomó tu partido en Bello · dom 4 oct, 3:00 p. m. Es Juan Pérez · WhatsApp +57 300 1234567. Seguimos buscando el otro.',
    );
  });

  it('tells the client the request is complete, naming the goalkeepers only when visible', () => {
    expect(requestCompleteMessage(match, 'r-1', 'b-2', 2, null)).toEqual({
      title: 'Solicitud completa',
      body: '¡Listo! Tus 2 porteros están confirmados para el partido en Bello · dom 4 oct, 3:00 p. m. Verás sus datos 1 hora antes.',
      data: { type: 'request.complete', requestId: 'r-1', bookingId: 'b-2' },
    });
    expect(requestCompleteMessage(match, 'r-1', 'b-1', 1, null).body).toBe(
      '¡Listo! Tu portero está confirmado para el partido en Bello · dom 4 oct, 3:00 p. m. Verás sus datos 1 hora antes.',
    );
    expect(requestCompleteMessage(match, 'r-1', 'b-2', 2, [juan, pedro]).body).toBe(
      '¡Listo! Tus 2 porteros están confirmados para el partido en Bello · dom 4 oct, 3:00 p. m. Son Juan Pérez · WhatsApp +57 300 1234567 y Pedro Gómez.',
    );
  });

  it('tells both sides who the other is one hour before', () => {
    expect(contactsVisibleMessage(match, 'r-1', [juan, pedro])).toEqual({
      title: 'Tus porteros',
      body: 'Tus porteros para el partido en Bello · dom 4 oct, 3:00 p. m.: Juan Pérez · WhatsApp +57 300 1234567 y Pedro Gómez.',
      data: { type: 'request.contacts_visible', requestId: 'r-1' },
    });
    expect(contactsVisibleMessage(match, 'r-1', [nameless]).body).toBe('Tu portero para el partido en Bello · dom 4 oct, 3:00 p. m.: tu portero.');
    expect(clientContactVisibleMessage(match, 'r-1', 'b-1', ana)).toEqual({
      title: 'Tu cliente',
      body: 'Tu cliente para el partido en Bello · dom 4 oct, 3:00 p. m.: Ana Ruiz · WhatsApp +57 310 7654321.',
      data: { type: 'booking.client_contact_visible', requestId: 'r-1', bookingId: 'b-1' },
    });
  });

  it('never has a double period or a non-breaking space, and is a valid push', () => {
    const all = [
      goalkeeperAssignedMessage(match, 'r', 'b', { replacement: false, contact: null }),
      goalkeeperAssignedMessage(match, 'r', 'b', { replacement: true, contact: juan }),
      requestCompleteMessage(match, 'r', 'b', 2, null),
      requestCompleteMessage(match, 'r', 'b', 1, [juan]),
      contactsVisibleMessage(match, 'r', [juan]),
      clientContactVisibleMessage(match, 'r', 'b', ana),
    ];
    for (const message of all) {
      expect(message.body).not.toMatch(/\.\.| | /);
      expect(validatePushMessage(message)).toMatchObject({ ok: true });
    }
  });
});
