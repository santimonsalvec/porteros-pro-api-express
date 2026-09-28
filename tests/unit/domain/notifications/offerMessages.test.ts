import { describe, expect, it } from 'vitest';
import { validatePushMessage } from '../../../../src/domain/devices/deviceRules.js';
import { groupedOfferMessage, localWhen, singleOfferMessage } from '../../../../src/domain/notifications/offerMessages.js';

const match = {
  zoneName: 'Bello',
  cityName: 'Medellín',
  startsAt: new Date('2026-10-04T20:00:00.000Z'),
  timeZone: 'America/Bogota',
  durationMinutes: 90,
  requestId: 'request-1',
  bookingId: 'booking-1',
};

describe('offer messages', () => {
  it('describes one match in Spanish, in the city time zone', () => {
    const message = singleOfferMessage(match);

    expect(message).toEqual({
      title: 'Partido disponible',
      body: 'Bello · dom 4 oct, 3:00 p. m. · 90 min',
      data: { type: 'booking.available', requestId: 'request-1', bookingId: 'booking-1' },
    });
    expect(validatePushMessage(message)).toEqual({ ok: true });
  });

  it('shows early-morning matches as a. m. of the local day', () => {
    expect(localWhen(new Date('2026-10-05T06:05:00.000Z'), 'America/Bogota')).toBe('lun 5 oct, 1:05 a. m.');
  });

  it('falls back to the city name, then to "tu zona"', () => {
    expect(singleOfferMessage({ ...match, zoneName: null }).body).toMatch(/^Medellín · /);
    expect(singleOfferMessage({ ...match, zoneName: null, cityName: null }).body).toMatch(/^tu zona · /);
  });

  it('groups several offers and opens the available-matches list', () => {
    const message = groupedOfferMessage(3);

    expect(message).toEqual({
      title: 'Partidos disponibles',
      body: 'Hay 3 partidos disponibles en tus zonas',
      data: { type: 'bookings.available' },
    });
    expect(validatePushMessage(message)).toEqual({ ok: true });
  });
});
