import { createHash, timingSafeEqual } from 'node:crypto';
import {
  GatewayUnavailableError,
  type GatewayCheckoutArgs,
  type GatewayOutcome,
  type GatewaySecrets,
  type GatewayTransactionStatus,
  type IPaymentGateway,
} from '../../application/features/payments/common/ports.js';
import type { GatewayEnvironment } from '../../domain/payments/gatewaySettings.js';

export const WOMPI_CHECKOUT_URL = 'https://checkout.wompi.co/p/';
const API_BASE: Record<GatewayEnvironment, string> = {
  sandbox: 'https://sandbox.wompi.co/v1',
  production: 'https://production.wompi.co/v1',
};
const QUERY_TIMEOUT_MS = 10_000;
const STATUSES: readonly GatewayTransactionStatus[] = ['APPROVED', 'DECLINED', 'VOIDED', 'ERROR', 'PENDING'];

export function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** Web Checkout's `signature:integrity`: SHA-256 of reference + amount in cents + currency + integrity secret. */
export function wompiIntegritySignature(reference: string, amountInCents: number, currency: string, integritySecret: string): string {
  return sha256Hex(`${reference}${amountInCents}${currency}${integritySecret}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A value of `data` by a dotted path such as `transaction.amount_in_cents`. */
function valueAt(data: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((node, key) => (isRecord(node) ? node[key] : undefined), data);
}

/**
 * An event's checksum (research.md §2): the values named by `signature.properties`, read from
 * `data`, then `timestamp`, then the events secret, hashed with SHA-256. `null` when the event
 * lacks what is needed.
 */
export function wompiEventChecksum(body: unknown, eventsSecret: string): string | null {
  if (!isRecord(body) || !isRecord(body.signature)) return null;
  const properties = body.signature.properties;
  const timestamp = body.timestamp;
  if (!Array.isArray(properties) || properties.length === 0 || (typeof timestamp !== 'number' && typeof timestamp !== 'string')) return null;
  const values: string[] = [];
  for (const property of properties) {
    if (typeof property !== 'string') return null;
    const value = valueAt(body.data, property);
    if (value === undefined || value === null || isRecord(value)) return null;
    values.push(String(value));
  }
  return sha256Hex(`${values.join('')}${String(timestamp)}${eventsSecret}`);
}

function sameHex(expected: string, received: unknown): boolean {
  if (typeof received !== 'string') return false;
  const a = Buffer.from(expected.toLowerCase(), 'utf8');
  const b = Buffer.from(received.toLowerCase(), 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

function toStatus(value: unknown): GatewayTransactionStatus {
  // An unknown status is treated as still pending: it never changes a top-up.
  return STATUSES.find((status) => status === value) ?? 'PENDING';
}

function toOutcome(transaction: unknown): GatewayOutcome | null {
  if (!isRecord(transaction)) return null;
  const { id, reference, amount_in_cents: amountInCents, currency, status } = transaction;
  if (typeof id !== 'string' && typeof id !== 'number') return null;
  if (typeof reference !== 'string' || typeof amountInCents !== 'number' || typeof currency !== 'string') return null;
  return { reference, transactionId: String(id), status: toStatus(status), amountInCents, currency };
}

/**
 * Wompi (Colombia): Web Checkout, `transaction.updated` events and the transactions query
 * (research.md §1–§3). Secrets are passed in per call and never logged or returned.
 */
export class WompiGateway implements IPaymentGateway {
  readonly name = 'wompi' as const;

  constructor(private readonly fetchFn: typeof fetch = fetch) {}

  buildCheckout(args: GatewayCheckoutArgs): string {
    const params = new URLSearchParams({
      'public-key': args.publicKey,
      currency: args.currency,
      'amount-in-cents': String(args.amountInCents),
      reference: args.reference,
      'signature:integrity': wompiIntegritySignature(args.reference, args.amountInCents, args.currency, args.secrets.integritySecret),
      'redirect-url': args.redirectUrl,
    });
    return `${WOMPI_CHECKOUT_URL}?${params.toString()}`;
  }

  parseEvent(body: unknown): { reference: string } | null {
    if (!isRecord(body) || body.event !== 'transaction.updated') return null;
    const reference = valueAt(body.data, 'transaction.reference');
    return typeof reference === 'string' && reference !== '' ? { reference } : null;
  }

  verifyEvent(body: unknown, headers: Record<string, string | undefined>, secrets: GatewaySecrets): GatewayOutcome | null {
    if (this.parseEvent(body) === null || !isRecord(body)) return null;
    const expected = wompiEventChecksum(body, secrets.eventsSecret);
    if (expected === null) return null;
    const signature = body.signature as Record<string, unknown>;
    if (!sameHex(expected, signature.checksum)) return null;
    // The header carries the same value; when present it must agree too.
    const header = headers['x-event-checksum'];
    if (header !== undefined && !sameHex(expected, header)) return null;
    return toOutcome(valueAt(body.data, 'transaction'));
  }

  async findByReference(reference: string, environment: GatewayEnvironment, secrets: GatewaySecrets): Promise<GatewayOutcome | null> {
    const url = `${API_BASE[environment]}/transactions?${new URLSearchParams({ reference }).toString()}`;
    let response: Response;
    try {
      response = await this.fetchFn(url, {
        headers: { Authorization: `Bearer ${secrets.privateKey}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(QUERY_TIMEOUT_MS),
      });
    } catch (error) {
      throw new GatewayUnavailableError(`Wompi query failed: ${error instanceof Error ? error.name : 'unknown error'}`);
    }
    if (!response.ok) throw new GatewayUnavailableError(`Wompi query answered ${response.status}`);
    const payload: unknown = await response.json().catch(() => null);
    const items = isRecord(payload) && Array.isArray(payload.data) ? payload.data : [];
    const newest = items
      .filter(isRecord)
      .filter((item) => item.reference === reference)
      .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))[0];
    return newest ? toOutcome(newest) : null;
  }
}
