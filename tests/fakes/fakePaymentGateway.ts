import {
  GatewayUnavailableError,
  type GatewayCheckoutArgs,
  type GatewayOutcome,
  type GatewaySecrets,
  type IPaymentGateway,
  type IPaymentGatewayRegistry,
} from '../../src/application/features/payments/common/ports.js';
import type { GatewayEnvironment, GatewayName } from '../../src/domain/payments/gatewaySettings.js';
import { sha256Hex, WompiGateway } from '../../src/infrastructure/payments/wompiGateway.js';

export interface FakeTransaction {
  id: string;
  reference: string;
  amount_in_cents: number;
  currency: string;
  status: string;
}

/**
 * A `transaction.updated` event signed exactly like Wompi (research.md §2), so the real
 * verification runs against it with known secrets.
 */
export function signedEvent(transaction: FakeTransaction, eventsSecret: string, timestamp = 1790000000) {
  const properties = ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'];
  const checksum = sha256Hex(`${transaction.id}${transaction.status}${transaction.amount_in_cents}${timestamp}${eventsSecret}`);
  return {
    event: 'transaction.updated',
    data: { transaction: { ...transaction, payment_method_type: 'CARD' } },
    environment: 'test',
    signature: { properties, checksum },
    timestamp,
    sent_at: new Date(timestamp * 1000).toISOString(),
  };
}

/**
 * Signs checkouts and verifies events with the real Wompi logic, but never calls Wompi: the
 * transactions query answers from a queue the test controls, and `available = false` makes it
 * fail like an unreachable gateway.
 */
export class FakePaymentGateway implements IPaymentGateway {
  private readonly real = new WompiGateway(() => Promise.reject(new Error('the fake gateway never calls Wompi')));
  private readonly answers: (GatewayOutcome | null)[] = [];
  readonly queries: { reference: string; environment: GatewayEnvironment }[] = [];
  available = true;

  constructor(readonly name: GatewayName = 'wompi') {}

  /** The next `findByReference` answers (then `null` = no transaction yet). */
  answer(...outcomes: (GatewayOutcome | null)[]): void {
    this.answers.push(...outcomes);
  }

  buildCheckout(args: GatewayCheckoutArgs): string {
    return this.real.buildCheckout(args);
  }

  parseEvent(body: unknown): { reference: string } | null {
    return this.real.parseEvent(body);
  }

  verifyEvent(body: unknown, headers: Record<string, string | undefined>, secrets: GatewaySecrets): GatewayOutcome | null {
    return this.real.verifyEvent(body, headers, secrets);
  }

  async findByReference(reference: string, environment: GatewayEnvironment): Promise<GatewayOutcome | null> {
    this.queries.push({ reference, environment });
    if (!this.available) throw new GatewayUnavailableError('fake gateway down');
    return this.answers.shift() ?? null;
  }
}

export class FakePaymentGatewayRegistry implements IPaymentGatewayRegistry {
  constructor(private readonly gateways: IPaymentGateway[]) {}

  get(name: string): IPaymentGateway | null {
    return this.gateways.find((gateway) => gateway.name === name) ?? null;
  }
}
