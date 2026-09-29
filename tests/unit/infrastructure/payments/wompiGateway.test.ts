import { describe, expect, it, vi } from 'vitest';
import { GatewayUnavailableError } from '../../../../src/application/features/payments/common/ports.js';
import {
  sha256Hex,
  WompiGateway,
  wompiEventChecksum,
  wompiIntegritySignature,
} from '../../../../src/infrastructure/payments/wompiGateway.js';

const SECRETS = { privateKey: 'prv_test_key', eventsSecret: 'test_events_secret', integritySecret: 'test_integrity_secret' };

/** A `transaction.updated` event signed like Wompi, with the checksum computed independently here. */
function event(transaction: Record<string, unknown>, secret = SECRETS.eventsSecret) {
  const timestamp = 1530291411;
  const checksum = sha256Hex(`${String(transaction.id)}${String(transaction.status)}${String(transaction.amount_in_cents)}${timestamp}${secret}`);
  return {
    event: 'transaction.updated',
    data: { transaction },
    environment: 'test',
    signature: { properties: ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'], checksum },
    timestamp,
    sent_at: '2026-09-29T12:00:00.000Z',
  };
}

const APPROVED = { id: '1234-1610641025-49201', amount_in_cents: 2000000, reference: 'PPR-abc', currency: 'COP', status: 'APPROVED' };

describe('WompiGateway', () => {
  it('signs the integrity like the docs example', () => {
    // Computed outside Node: printf '%s' 'sk8-438k4-xmxm392-sn2m24990000COPprod_integrity_Z5mMke9x0k8gpErbDqwrJXMqsI6SFli6' | shasum -a 256
    expect(wompiIntegritySignature('sk8-438k4-xmxm392-sn2m2', 4990000, 'COP', 'prod_integrity_Z5mMke9x0k8gpErbDqwrJXMqsI6SFli6')).toBe(
      '5ff930ad9a8011ab0da31a69e884c248fb4fd1590fba337cf7e60c4ed75cbb6b',
    );
  });

  it('builds the Web Checkout address with every parameter', () => {
    const url = new URL(
      new WompiGateway().buildCheckout({
        reference: 'PPR-abc',
        amountInCents: 2000000,
        currency: 'COP',
        redirectUrl: 'https://api.example.com/pagos/retorno/PPR-abc',
        publicKey: 'pub_test_key',
        secrets: SECRETS,
      }),
    );

    expect(`${url.origin}${url.pathname}`).toBe('https://checkout.wompi.co/p/');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      'public-key': 'pub_test_key',
      currency: 'COP',
      'amount-in-cents': '2000000',
      reference: 'PPR-abc',
      'signature:integrity': sha256Hex(`PPR-abc2000000COP${SECRETS.integritySecret}`),
      'redirect-url': 'https://api.example.com/pagos/retorno/PPR-abc',
    });
    expect(url.toString()).not.toContain(SECRETS.integritySecret);
  });

  it('reads the reference of a transaction event, and nothing else', () => {
    const gateway = new WompiGateway();

    expect(gateway.parseEvent(event(APPROVED))).toEqual({ reference: 'PPR-abc' });
    expect(gateway.parseEvent({ ...event(APPROVED), event: 'nequi_token.updated' })).toBeNull();
    expect(gateway.parseEvent('nonsense')).toBeNull();
    expect(gateway.parseEvent({ event: 'transaction.updated', data: {} })).toBeNull();
  });

  it('verifies a genuine event and maps its transaction', () => {
    const body = event(APPROVED);

    expect(new WompiGateway().verifyEvent(body, { 'x-event-checksum': body.signature.checksum.toUpperCase() }, SECRETS)).toEqual({
      reference: 'PPR-abc',
      transactionId: '1234-1610641025-49201',
      status: 'APPROVED',
      amountInCents: 2000000,
      currency: 'COP',
    });
  });

  it('refuses a tampered status', () => {
    const body = event(APPROVED);
    body.data.transaction = { ...APPROVED, status: 'DECLINED' };

    expect(new WompiGateway().verifyEvent(body, {}, SECRETS)).toBeNull();
  });

  it('refuses a tampered amount', () => {
    const body = event(APPROVED);
    body.data.transaction = { ...APPROVED, amount_in_cents: 99999900 };

    expect(new WompiGateway().verifyEvent(body, {}, SECRETS)).toBeNull();
  });

  it('refuses an event signed with another secret', () => {
    expect(new WompiGateway().verifyEvent(event(APPROVED, 'prod_events_other'), {}, SECRETS)).toBeNull();
  });

  it('refuses a header that disagrees with the body', () => {
    expect(new WompiGateway().verifyEvent(event(APPROVED), { 'x-event-checksum': 'abc' }, SECRETS)).toBeNull();
  });

  it('refuses an event without its signature parts', () => {
    const body = event(APPROVED);
    expect(wompiEventChecksum({ ...body, signature: { properties: [], checksum: 'x' } }, SECRETS.eventsSecret)).toBeNull();
    expect(wompiEventChecksum({ ...body, timestamp: undefined }, SECRETS.eventsSecret)).toBeNull();
    expect(wompiEventChecksum({ ...body, signature: { properties: ['transaction.missing'], checksum: 'x' } }, SECRETS.eventsSecret)).toBeNull();
  });

  it('treats an unknown status as pending', () => {
    const body = event({ ...APPROVED, status: 'SOMETHING_NEW' });

    expect(new WompiGateway().verifyEvent(body, {}, SECRETS)?.status).toBe('PENDING');
  });

  it('asks for the newest transaction of a reference with the private key', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            { ...APPROVED, id: 'old', status: 'DECLINED', created_at: '2026-09-29T12:00:00.000Z' },
            { ...APPROVED, id: 'new', created_at: '2026-09-29T12:05:00.000Z' },
          ],
        }),
        { status: 200 },
      ),
    );

    const outcome = await new WompiGateway(fetchFn).findByReference('PPR-abc', 'sandbox', SECRETS);

    expect(fetchFn).toHaveBeenCalledWith(
      'https://sandbox.wompi.co/v1/transactions?reference=PPR-abc',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer prv_test_key' }) }),
    );
    expect(outcome).toMatchObject({ transactionId: 'new', status: 'APPROVED', amountInCents: 2000000 });
  });

  it('uses the production API in production', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }));

    expect(await new WompiGateway(fetchFn).findByReference('PPR-abc', 'production', SECRETS)).toBeNull();
    expect(fetchFn.mock.calls[0]![0]).toBe('https://production.wompi.co/v1/transactions?reference=PPR-abc');
  });

  it('reports the gateway unavailable on an error answer or a network failure', async () => {
    const failing = vi.fn().mockResolvedValue(new Response('{}', { status: 503 }));
    const unreachable = vi.fn().mockRejectedValue(new TypeError('fetch failed'));

    await expect(new WompiGateway(failing).findByReference('PPR-abc', 'sandbox', SECRETS)).rejects.toBeInstanceOf(GatewayUnavailableError);
    await expect(new WompiGateway(unreachable).findByReference('PPR-abc', 'sandbox', SECRETS)).rejects.toBeInstanceOf(GatewayUnavailableError);
  });

  it('never puts the private key in an error', async () => {
    const failing = vi.fn().mockResolvedValue(new Response('{}', { status: 401 }));

    const error = await new WompiGateway(failing).findByReference('PPR-abc', 'sandbox', SECRETS).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(GatewayUnavailableError);
    expect(String((error as Error).message)).not.toContain('prv_test_key');
  });
});
