import { describe, expect, it } from 'vitest';
import { MatchFormat } from '../../../../src/domain/bookings/matchFormat.js';
import { validatePushMessage } from '../../../../src/domain/devices/deviceRules.js';
import { groupedOfferMessage, localWhen, singleOfferMessage } from '../../../../src/domain/notifications/offerMessages.js';

const match = {
  zoneName: 'Bello',
  marketName: 'Medellín',
  startsAt: new Date('2026-10-04T20:00:00.000Z'),
  timeZone: 'America/Bogota',
  durationMinutes: 90,
  format: null,
  requestId: 'request-1',
  bookingId: 'booking-1',
};

describe('offer messages', () => {
  it('describes one match in Spanish, in the city time zone', () => {
    const message = singleOfferMessage('es', match);

    expect(message).toEqual({
      title: 'Partido disponible',
      body: 'Bello · dom 4 oct, 3:00 p. m. · 90 min',
      data: { type: 'booking.available', requestId: 'request-1', bookingId: 'booking-1' },
    });
    expect(validatePushMessage(message)).toEqual({ ok: true });
  });

  it.each([
    ['futbol_11', 'Partido disponible · Fútbol 11'],
    ['micro_futsal', 'Partido disponible · Micro / Futsal'],
    ['futbol_medio', 'Partido disponible · Fútbol medio'],
    ['any', 'Partido disponible · Abierto'],
  ])('names the %s modality and the surface (feature 024)', (modality, title) => {
    const format = new MatchFormat({ modality, surfaceId: 'synthetic_grass', surfaceName: 'Grama sintética' });

    const message = singleOfferMessage('es', { ...match, format });

    expect(message.title).toBe(title);
    expect(message.body).toBe('Bello · dom 4 oct, 3:00 p. m. · 90 min · Grama sintética');
    expect(validatePushMessage(message)).toEqual({ ok: true });
  });

  it('shows early-morning matches as a. m. of the local day', () => {
    expect(localWhen(new Date('2026-10-05T06:05:00.000Z'), 'America/Bogota', 'es')).toBe('lun 5 oct, 1:05 a. m.');
  });

  it('falls back to the city name, then to "tu zona"', () => {
    expect(singleOfferMessage('es', { ...match, zoneName: null }).body).toMatch(/^Medellín · /);
    expect(singleOfferMessage('es', { ...match, zoneName: null, marketName: null }).body).toMatch(/^tu zona · /);
  });

  it('groups several offers and opens the available-matches list', () => {
    const message = groupedOfferMessage('es', 3);

    expect(message).toEqual({
      title: 'Partidos disponibles',
      body: 'Hay 3 partidos disponibles en tus zonas',
      data: { type: 'bookings.available' },
    });
    expect(validatePushMessage(message)).toEqual({ ok: true });
  });
});
