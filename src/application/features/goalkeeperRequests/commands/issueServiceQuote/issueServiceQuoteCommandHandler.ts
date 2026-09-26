import type { IClock } from '../../../../common/clock.js';
import type { ICommandHandler, ISender } from '../../../../common/mediator/types.js';
import type { IIdGenerator } from '../../../auth/common/ports.js';
import type { IQuoteRepository } from '../../common/ports.js';
import { QUOTE_VALIDITY_MINUTES } from '../../common/bookingLimits.js';
import { GetServiceQuoteQuery } from '../../queries/getServiceQuote/getServiceQuoteQuery.js';
import { MatchDetails } from '../../../../../domain/bookings/matchDetails.js';
import { PricingSnapshot } from '../../../../../domain/bookings/pricingSnapshot.js';
import { Quote } from '../../../../../domain/bookings/quote.js';
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
      cityId: area.cityId,
      startsAt: new Date(priced.startsAt),
      startsAtLocal: priced.startsAtLocal,
      timeZone: priced.timeZone,
      goalkeeperCount: command.input.goalkeeperCount,
      durationMinutes: command.input.durationMinutes,
    });
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
    );
    await this.quoteRepository.add(quote);

    return {
      outcome: 'success',
      quote: { ...priced, quoteId: quote.id, expiresAt: quote.expiresAt.toISOString() },
    };
  }
}
