import type { IClock } from '../../../../common/clock.js';
import type { ICommandHandler, ISender } from '../../../../common/mediator/types.js';
import type { IIdGenerator } from '../../../auth/common/ports.js';
import type { IQuoteRepository } from '../../common/ports.js';
import { FREE_CANCELLATION_MINUTES_DEFAULT, QUOTE_VALIDITY_MINUTES, TRAVEL_BUFFER_MINUTES_DEFAULT } from '../../common/bookingLimits.js';
import { GetServiceQuoteQuery } from '../../queries/getServiceQuote/getServiceQuoteQuery.js';
import { MatchDetails } from '../../../../../domain/bookings/matchDetails.js';
import { PricingSnapshot } from '../../../../../domain/bookings/pricingSnapshot.js';
import { Quote } from '../../../../../domain/bookings/quote.js';
import { discountFor } from '../../../../../domain/pricing/unverifiedDiscount.js';
import type { UnverifiedTerms } from '../../../pricing/common/unverifiedDiscountResolver.js';
import {
  IssueServiceQuoteCommand,
  type IssueServiceQuoteResult,
} from './issueServiceQuoteCommand.js';

/**
 * Prices through the unchanged, read-only `GetServiceQuoteQuery` (dispatched via the mediator,
 * like `SaveDocumentPhotoCommandHandler`), then stores the successful quote for
 * `QUOTE_VALIDITY_MINUTES`. Refusals store nothing. A storage failure is not caught: the
 * request fails and no price is returned, so a client never sees a price it cannot confirm.
 */
export class IssueServiceQuoteCommandHandler implements ICommandHandler<
  IssueServiceQuoteCommand,
  IssueServiceQuoteResult
> {
  constructor(
    private readonly sender: ISender,
    private readonly quoteRepository: IQuoteRepository,
    private readonly idGenerator: IIdGenerator,
    private readonly clock: IClock,
    /** Admin spec 030: the zone's discount and verified-only window; none without it. */
    private readonly unverified?: { forZone(zoneId: string): Promise<UnverifiedTerms> },
  ) {}

  async handle(command: IssueServiceQuoteCommand): Promise<IssueServiceQuoteResult> {
    const issuedAt = this.clock.now();
    const result = await this.sender.send(new GetServiceQuoteQuery(command.input));
    if (result.outcome !== 'success') return result;

    const { quote: priced, area } = result;
    const match = new MatchDetails({
      latitude: command.input.latitude,
      longitude: command.input.longitude,
      zoneId: area.zoneId,
      marketId: area.marketId,
      startsAt: new Date(priced.startsAt),
      startsAtLocal: priced.startsAtLocal,
      timeZone: priced.timeZone,
      goalkeeperCount: command.input.goalkeeperCount,
      durationMinutes: command.input.durationMinutes,
      format: area.format,
    });
    const terms = this.unverified ? await this.unverified.forZone(area.zoneId) : { discountBps: 0, verifiedPriorityMinutes: 0 };
    const pricing = new PricingSnapshot(
      {
        unitRate: priced.unitRate,
        subtotal: priced.subtotal,
        unitSurcharge: priced.unitSurcharge,
        surcharge: priced.surcharge,
        total: priced.total,
        currency: priced.currency,
      },
      priced.goalkeeperCount,
    );
    const quote = Quote.issue(
      this.idGenerator.newId(),
      command.clientId,
      match,
      pricing,
      issuedAt,
      QUOTE_VALIDITY_MINUTES,
      area.freeCancellationMinutes ?? FREE_CANCELLATION_MINUTES_DEFAULT,
      area.commission,
      area.travelBufferMinutes ?? TRAVEL_BUFFER_MINUTES_DEFAULT,
      terms,
    );
    await this.quoteRepository.add(quote);
    // The price per goalkeeper if one without the seal takes it (FR-017): only when there is a discount.
    const unitFull = priced.unitRate + priced.unitSurcharge;
    const unitDiscount = discountFor(unitFull, terms.discountBps, area.commission);
    const unverifiedDiscount = terms.discountBps > 0 ? { rateBps: terms.discountBps, unitDiscount, unitTotal: unitFull - unitDiscount } : null;

    return {
      outcome: 'success',
      quote: {
        ...priced,
        quoteId: quote.id,
        expiresAt: quote.expiresAt.toISOString(),
        cancelAllAvailable: quote.isCancelAllAvailableAt(issuedAt),
        cancelAllUntil: quote.cancelAllUntil().toISOString(),
        ...(unverifiedDiscount ? { unverifiedDiscount } : {}),
      },
      freeCancellationDefaulted: area.freeCancellationMinutes === null,
      travelBufferDefaulted: area.travelBufferMinutes === null,
      marketId: area.marketId,
    };
  }
}
