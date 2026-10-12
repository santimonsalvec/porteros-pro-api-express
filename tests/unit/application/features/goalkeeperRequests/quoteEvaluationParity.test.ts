import { describe, expect, it } from 'vitest';
import { GetServiceQuoteQuery } from '../../../../../src/application/features/goalkeeperRequests/queries/getServiceQuote/getServiceQuoteQuery.js';
import { GetServiceQuoteQueryHandler } from '../../../../../src/application/features/goalkeeperRequests/queries/getServiceQuote/getServiceQuoteQueryHandler.js';
import { parseStartsAt } from '../../../../../src/application/features/goalkeeperRequests/common/startsAt.js';
import { GetPricingPreviewQuery } from '../../../../../src/application/features/pricing/queries/getPricingPreview/getPricingPreviewQuery.js';
import { GetPricingPreviewQueryHandler } from '../../../../../src/application/features/pricing/queries/getPricingPreview/getPricingPreviewQueryHandler.js';
import type { MatchLevel, Modality } from '../../../../../src/domain/bookings/matchFormat.js';
import { RentalRate } from '../../../../../src/domain/pricing/rentalRate.js';
import { CommissionSetting } from '../../../../../src/domain/wallet/commissionSetting.js';
import { FakeMatchSurfaceRepository } from '../../../../fakes/fakeMatchSurfaceRepository.js';
import { POINTS } from '../../../../fixtures/quoteFixtures.js';
import { previewWorld } from '../pricing/preview/previewWorld.js';

/**
 * The admin's simulator and the app's quote judge the same point the same way (admin spec 004,
 * SC-003): same clock, same data, same price, surcharge, commission and verdict.
 */
const ZONES = {
  caliNorte: 'zone-cali-norte',
  caliSur: 'zone-cali-sur',
  caliCentro: 'zone-cali-centro',
} as const;

const CASES: [keyof typeof ZONES, string, 60 | 90 | 120, Modality, MatchLevel][] = [
  ['caliNorte', '2026-09-21T13:30', 60, 'futbol_11', 'competitive'],
  ['caliNorte', '2026-09-21T14:00', 90, 'micro_futsal', 'recreational'],
  ['caliNorte', '2026-09-21T16:00', 120, 'any', 'recreational'],
  ['caliSur', '2026-09-21T14:30', 60, 'futbol_11', 'competitive'],
  ['caliSur', '2026-09-22T09:00', 90, 'futbol_11', 'competitive'],
  ['caliSur', '2026-09-21T15:00', 120, 'futbol_medio', 'recreational'],
  ['caliCentro', '2026-09-21T15:00', 60, 'futbol_11', 'competitive'],
  ['caliCentro', '2026-09-21T15:00', 60, 'futbol_11', 'recreational'],
  ['caliCentro', '2026-09-21T13:00', 60, 'any', 'recreational'],
  ['caliCentro', '2026-09-21T12:00', 60, 'any', 'recreational'],
  ['caliCentro', '2026-09-21T15:15', 60, 'any', 'recreational'],
  ['caliCentro', '2026-09-25T15:00', 60, 'any', 'recreational'],
];

describe('the simulator matches the quote', () => {
  it.each(CASES)('%s at %s, %i min, %s %s', async (point, startsAtLocal, durationMinutes, modality, level) => {
    const world = previewWorld();
    world.rentalRateRepository.seed(new RentalRate({ id: 'f11', scope: 'city', refId: 'city-cali', durationMinutes: 60, amount: 50000, modality: 'futbol_11', level: 'competitive' }));
    world.commissionSettingRepository.seed(new CommissionSetting({ id: 'c-sur', scope: 'zone', refId: 'zone-cali-sur', amount: 9000 }));
    const quote = await new GetServiceQuoteQueryHandler(
      world.zoneRepository,
      world.cityRepository,
      world.regionRepository,
      world.countryRepository,
      world.rentalRateRepository,
      world.bookingSettingsRepository,
      world.commissionResolver,
      world.clock,
      new FakeMatchSurfaceRepository(),
    ).handle(
      new GetServiceQuoteQuery({ ...POINTS[point], startsAt: parseStartsAt(`${startsAtLocal}:00`)!, goalkeeperCount: 1, durationMinutes, modality, level, surfaceId: 'synthetic_grass' }),
    );
    const result = await new GetPricingPreviewQueryHandler(world).handle(
      new GetPricingPreviewQuery({ zoneId: ZONES[point], durationMinutes, modality, level, startsAtLocal, quoteFromLocal: null }),
    );
    if (result.outcome !== 'ok') throw new Error(`preview failed: ${result.outcome}`);
    const { preview } = result;

    if (quote.outcome === 'success') {
      expect(preview.quotable).toEqual({ ok: true });
      expect([preview.rate?.amount, preview.surcharge?.amount, preview.commission?.amount]).toEqual([
        quote.quote.unitRate,
        quote.quote.unitSurcharge,
        quote.area.commission,
      ]);
    } else {
      expect(preview.quotable).toMatchObject({ ok: false, outcome: quote.outcome });
    }
  });
});
