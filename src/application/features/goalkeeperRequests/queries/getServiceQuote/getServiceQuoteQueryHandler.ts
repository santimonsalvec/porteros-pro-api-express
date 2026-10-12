import type { IClock } from '../../../../common/clock.js';
import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { ICityRepository, IRegionRepository } from '../../../locations/common/ports.js';
import type { IZoneRepository } from '../../../zones/common/ports.js';
import type {
  IBookingSettingsRepository,
  ICountryLookup,
  IMatchSurfaceRepository,
  IRentalRateRepository,
} from '../../common/ports.js';
import { MatchFormat } from '../../../../../domain/bookings/matchFormat.js';
import { matchFormatResponse } from '../../common/matchFormatResponse.js';
import { evaluateQuoteInArea } from '../../common/quoteEvaluation.js';
import { resolveServiceArea } from '../../common/serviceArea.js';
import type { ICommissionResolver } from '../../../wallet/common/ports.js';
import { GetServiceQuoteQuery, type GetServiceQuoteResult } from './getServiceQuoteQuery.js';

/**
 * Read-only: prices a goalkeeper booking. Evaluation follows research.md §11 — the
 * first failing rule is the one reported. Nothing here writes to any repository (FR-020).
 * Steps (3) to (9) live in `evaluateQuoteInArea`, which the admin's simulator shares.
 */
export class GetServiceQuoteQueryHandler implements IQueryHandler<GetServiceQuoteQuery, GetServiceQuoteResult> {
  constructor(
    private readonly zoneRepository: IZoneRepository,
    private readonly cityRepository: ICityRepository,
    private readonly regionRepository: IRegionRepository,
    private readonly countryLookup: ICountryLookup,
    private readonly rentalRateRepository: IRentalRateRepository,
    private readonly bookingSettingsRepository: IBookingSettingsRepository,
    private readonly commissionResolver: ICommissionResolver,
    private readonly clock: IClock,
    private readonly matchSurfaceRepository: IMatchSurfaceRepository,
  ) {}

  async handle(query: GetServiceQuoteQuery): Promise<GetServiceQuoteResult> {
    const { latitude, longitude, startsAt, goalkeeperCount, durationMinutes, modality, level, surfaceId } = query.input;
    // One reading of "now" for the whole evaluation, so every rule sees the same moment.
    const nowMs = this.clock.now().getTime();

    // (0) The surface must exist and still be offered (feature 024). It never changes the price;
    //     its current name is kept as the request's snapshot.
    const surface = await this.matchSurfaceRepository.findById(surfaceId);
    if (!surface?.active) return { outcome: 'unknown_surface', surfaceId };
    const format = new MatchFormat({ modality, level, surfaceId: surface.id, surfaceName: surface.name });

    // (1)(2) Which active zone contains the point, and the (anchor) city that owns it: it supplies
    //        the time zone, the rate fallback and the settings scope.
    const area = await resolveServiceArea(this.zoneRepository, this.cityRepository, latitude, longitude);
    if (area.outcome !== 'ok') return area;
    const { zone, city, timeZone } = area;

    // (3)–(9) Start, configuration, notice, window, rate, surcharge and totals.
    const priced = await evaluateQuoteInArea(
      {
        regionRepository: this.regionRepository,
        countryLookup: this.countryLookup,
        rentalRateRepository: this.rentalRateRepository,
        bookingSettingsRepository: this.bookingSettingsRepository,
        commissionResolver: this.commissionResolver,
      },
      { zone, city, timeZone, startsAt, goalkeeperCount, durationMinutes, match: { modality, level }, nowMs },
    );
    if (priced.outcome !== 'priced') return priced;

    const { unitRate, subtotal, unitSurcharge, surcharge, total, currency, startEpochMs, startsAtLocal } = priced;
    return {
      outcome: 'success',
      quote: {
        unitRate,
        goalkeeperCount,
        subtotal,
        unitSurcharge,
        surcharge,
        total,
        currency,
        startsAt: new Date(startEpochMs).toISOString(),
        startsAtLocal,
        timeZone,
        matchFormat: matchFormatResponse(format),
      },
      area: {
        zoneId: zone.id,
        cityId: city.id,
        freeCancellationMinutes: priced.freeCancellationMinutes,
        commission: priced.commission,
        travelBufferMinutes: priced.travelBufferMinutes,
        format,
      },
    };
  }
}
