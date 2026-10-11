import { describe, expect, it } from 'vitest';
import { needsAcknowledgement, warning } from '../../../../../src/application/features/geography/common/warnings.js';

describe('needsAcknowledgement', () => {
  const overlap = warning('far_from_city_zones', { maxDistanceKm: 7.2 });

  it('is false without warnings or once acknowledged', () => {
    expect(needsAcknowledgement([], false)).toBe(false);
    expect(needsAcknowledgement([overlap], true)).toBe(false);
  });

  it('is true with warnings not yet acknowledged', () => {
    expect(needsAcknowledgement([overlap], false)).toBe(true);
    expect(needsAcknowledgement([overlap], undefined)).toBe(true);
  });
});

describe('warning messages', () => {
  it('names the zone overlapped, the shared area and which zone wins there', () => {
    const w = warning('overlaps_zone', { zoneId: 'z1', zoneName: 'Laureles', overlapSquareMeters: 1840.4, winsZoneId: 'z1', winsZoneName: 'Laureles' });
    expect(w).toEqual({
      code: 'overlaps_zone',
      message: 'Se solapa con Laureles (1.840 m²); en el área común gana Laureles',
      data: { zoneId: 'z1', zoneName: 'Laureles', overlapSquareMeters: 1840.4, winsZoneId: 'z1', winsZoneName: 'Laureles' },
    });
  });

  it.each([
    ['far_from_city_zones', { maxDistanceKm: 7.25 }, 'Queda a 7,3 km de las demás zonas de la ciudad'],
    [
      'country_code_changes_secrets',
      { from: 'CO', to: 'EC' },
      'Los secretos de la pasarela y de la facturación se buscan por el código del país: pasarán de CO a EC',
    ],
    ['document_type_not_invoiceable', { code: 'ti' }, 'Las facturas de porteros con este tipo serán rechazadas'],
    [
      'time_zone_has_future_bookings',
      {},
      'Hay partidos futuros en esta ciudad: conservan su hora real y solo cambia cómo se muestran',
    ],
  ] as const)('%s', (code, data, message) => {
    expect(warning(code, data).message).toBe(message);
  });
});
