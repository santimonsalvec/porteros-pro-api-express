import type { IEventPublisher } from '../../src/application/features/events/common/ports.js';
import type { DomainEvent } from '../../src/domain/events/domainEvent.js';

/** Records every batch handed over. Can fail or hang the next call (honoring the abort signal). */
export class FakeEventPublisher implements IEventPublisher {
  readonly batches: DomainEvent[][] = [];
  private nextError: Error | null = null;
  private nextDelayMs = 0;

  failNextWith(error: Error): void {
    this.nextError = error;
  }

  delayNextMs(ms: number): void {
    this.nextDelayMs = ms;
  }

  published(): DomainEvent[] {
    return this.batches.flat();
  }

  async publish(events: readonly DomainEvent[], signal?: AbortSignal): Promise<void> {
    const delay = this.nextDelayMs;
    this.nextDelayMs = 0;
    if (delay > 0) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, delay);
        signal?.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new Error('aborted'));
        });
      });
    }
    if (this.nextError) {
      const error = this.nextError;
      this.nextError = null;
      throw error;
    }
    this.batches.push([...events]);
  }
}
