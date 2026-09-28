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
}

export type IssueServiceQuoteResult =
  | {
      outcome: 'success';
      quote: IssuedServiceQuote;
      /** True when the area has no free-cancellation period and the default was stored. Not serialized. */
      freeCancellationDefaulted: boolean;
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
