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
  | { outcome: 'success'; quote: IssuedServiceQuote }
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
