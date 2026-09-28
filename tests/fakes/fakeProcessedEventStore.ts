import type { IProcessedEventStore } from '../../src/application/features/events/common/ports.js';

export class FakeProcessedEventStore implements IProcessedEventStore {
  readonly keys = new Set<string>();

  async has(key: string): Promise<boolean> {
    return this.keys.has(key);
  }

  async markProcessed(key: string): Promise<void> {
    this.keys.add(key);
  }
}
