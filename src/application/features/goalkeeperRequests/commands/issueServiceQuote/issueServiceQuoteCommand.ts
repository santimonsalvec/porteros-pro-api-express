import { ICommand } from '../../../../common/mediator/types.js';
import type {
  GetServiceQuoteResult,
  ServiceQuote,
  ServiceQuoteInput,
} from '../../queries/getServiceQuote/getServiceQuoteQuery.js';

/** The 007 breakdown plus what the app needs to confirm it. */
export interface IssuedServiceQuote extends ServiceQuote {
  quoteId: string;
  /** UTC ISO-8601; the quote can be confirmed strictly before this instant. */
  expiresAt: string;
  /** Whether "cancel all" can be chosen when confirming (feature 016, clarification 1). */
  cancelAllAvailable: boolean;
  /** UTC ISO-8601: start − free-cancellation period, when a "cancel all" request is evaluated. */
  cancelAllUntil: string;
}

export type IssueServiceQuoteResult =
  | {
      outcome: 'success';
      quote: IssuedServiceQuote;
      /** True when the area has no free-cancellation period and the default was stored. Not serialized. */
      freeCancellationDefaulted: boolean;
      /** True when the area has no travel margin and the default was stored. Not serialized. */
      travelBufferDefaulted: boolean;
      /** The anchor city of the quote, for the warning above. Not serialized. */
      cityId: string;
    }
  | Exclude<GetServiceQuoteResult, { outcome: 'success' }>;

/** Prices a booking and stores the quote so the client can confirm it (the quote endpoint). */
export class IssueServiceQuoteCommand extends ICommand<IssueServiceQuoteResult> {
  constructor(
    public readonly clientId: string,
    public readonly input: ServiceQuoteInput,
  ) {
    super();
  }
}
