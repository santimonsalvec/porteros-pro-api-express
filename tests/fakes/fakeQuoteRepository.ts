import type { IQuoteRepository } from '../../src/application/features/goalkeeperRequests/common/ports.js';
import type { Quote } from '../../src/domain/bookings/quote.js';

export class FakeQuoteRepository implements IQuoteRepository {
  private readonly quotes = new Map<string, Quote>();
  private nextAddError: Error | null = null;

  seed(quote: Quote): void {
    this.quotes.set(quote.id, quote);
  }

  all(): Quote[] {
    return [...this.quotes.values()];
  }

  /** Removes a quote, e.g. as the TTL monitor or a confirmation would. */
  remove(quoteId: string): void {
    this.quotes.delete(quoteId);
  }

  /** The next `add` rejects with this error, to simulate the database being unavailable. */
  failNextAdd(error: Error): void {
    this.nextAddError = error;
  }

  async add(quote: Quote): Promise<void> {
    if (this.nextAddError) {
      const error = this.nextAddError;
      this.nextAddError = null;
      throw error;
    }
    this.quotes.set(quote.id, quote);
  }

  async findByIdForClient(quoteId: string, clientId: string): Promise<Quote | null> {
    const quote = this.quotes.get(quoteId);
    return quote && quote.clientId === clientId ? quote : null;
  }
}
