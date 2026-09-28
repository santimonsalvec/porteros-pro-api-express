import type {
  Device,
  IPushSender,
  PushMessage,
  PushSendOutcome,
} from '../../src/application/features/devices/common/ports.js';

/** Records every send; each token answers `sent` unless scripted otherwise. */
export class FakePushSender implements IPushSender {
  readonly calls: Array<{ token: string; userId: string; message: PushMessage }> = [];
  private readonly outcomes = new Map<string, PushSendOutcome>();
  private readonly throwing = new Set<string>();
  private delayMs = 0;
  private inFlight = 0;
  maxInFlight = 0;

  setOutcome(token: string, outcome: PushSendOutcome): void {
    this.outcomes.set(token, outcome);
  }

  /** Simulates a buggy sender that breaks its never-throw contract. */
  throwOn(token: string): void {
    this.throwing.add(token);
  }

  /** Makes every send take this long, to observe concurrency. */
  delayEachMs(ms: number): void {
    this.delayMs = ms;
  }

  async send(device: Device, message: PushMessage): Promise<{ outcome: PushSendOutcome; reason?: string }> {
    this.inFlight += 1;
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
    try {
      if (this.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, this.delayMs));
      this.calls.push({ token: device.token, userId: device.userId, message });
      if (this.throwing.has(device.token)) throw new Error('sender bug');
      const outcome = this.outcomes.get(device.token) ?? 'sent';
      return outcome === 'sent' ? { outcome } : { outcome, reason: `scripted_${outcome}` };
    } finally {
      this.inFlight -= 1;
    }
  }
}
