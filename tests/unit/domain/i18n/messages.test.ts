import { describe, expect, it } from 'vitest';
import { catalog, type MessageCatalog } from '../../../../src/domain/i18n/messages/catalog.js';
import { es } from '../../../../src/domain/i18n/messages/es.js';
import { en } from '../../../../src/domain/i18n/messages/en.js';

describe('message catalog (feature 032, research §10)', () => {
  it('has every member in both languages, with the same arity', () => {
    const keys = Object.keys(es) as (keyof MessageCatalog)[];
    expect(keys.length).toBeGreaterThan(30);
    for (const key of keys) {
      const spanish = es[key];
      const english = en[key];
      expect(typeof english, key).toBe(typeof spanish);
      if (typeof spanish === 'function') expect((english as (...args: unknown[]) => unknown).length, key).toBe(spanish.length);
    }
    expect(Object.keys(en).sort()).toEqual(keys.sort());
  });

  it('answers each language', () => {
    expect(catalog('es')).toBe(es);
    expect(catalog('en')).toBe(en);
  });

  it('words the notices', () => {
    expect(es.requestExpired('en Bello · dom 4 oct, 3:00 p. m.')).toEqual({
      title: 'Sin portero para tu partido',
      body: 'No logramos hallar un portero para tu partido en Bello · dom 4 oct, 3:00 p. m.',
    });
    expect(en.requestExpired('in Bello · Sun, Oct 4, 3:00 PM')).toEqual({
      title: 'No goalkeeper for your match',
      body: 'We could not find a goalkeeper for your match in Bello · Sun, Oct 4, 3:00 PM',
    });
    expect(es.depositApproved('17.000 COP', '37.000 COP').body).toBe('Depósito aprobado: +17.000 COP. Tu saldo operativo es 37.000 COP.');
    expect(en.depositApproved('17.000 COP', '37.000 COP').body).toBe('Deposit approved: +17.000 COP. Your operating balance is 37.000 COP.');
    expect(es.validated().title).toBe('Ya puedes recibir solicitudes');
    expect(en.validated().title).toBe('You can now receive requests');
  });

  it('words an offer, single and grouped', () => {
    const offer = { modality: 'Fútbol 11', place: 'Bello', when: 'dom 4 oct, 3:00 p. m.', durationMinutes: 90, surfaceName: 'Grama sintética' };
    expect(es.singleOffer(offer)).toEqual({ title: 'Partido disponible · Fútbol 11', body: 'Bello · dom 4 oct, 3:00 p. m. · 90 min · Grama sintética' });
    expect(en.singleOffer({ ...offer, modality: '11-a-side', when: 'Sun, Oct 4, 3:00 PM' })).toEqual({
      title: 'Match available · 11-a-side',
      body: 'Bello · Sun, Oct 4, 3:00 PM · 90 min · Grama sintética',
    });
    expect(es.groupedOffer(1).body).toBe('Hay 1 partidos disponibles en tus zonas');
    expect(es.groupedOffer(3).body).toBe('Hay 3 partidos disponibles en tus zonas');
    expect(en.groupedOffer(1).body).toBe('There is 1 match available in your zones');
    expect(en.groupedOffer(3).body).toBe('There are 3 matches available in your zones');
  });

  it('words the payment return page and the test push', () => {
    expect(es.depositApprovedPage('18.536 COP')).toEqual({ title: 'Depósito aprobado', detail: 'Sumamos 18.536 COP a tu saldo operativo.' });
    expect(en.depositApprovedPage('18.536 COP')).toEqual({ title: 'Deposit approved', detail: 'We added 18.536 COP to your operating balance.' });
    expect(es.testPush()).toEqual({ title: 'PorterosPRO', body: 'Notificación de prueba: tus avisos están funcionando.' });
    expect(en.testPush()).toEqual({ title: 'PorterosPRO', body: 'Test notification: your notices are working.' });
  });
});
