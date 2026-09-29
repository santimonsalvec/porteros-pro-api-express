import { describe, expect, it } from 'vitest';
import { InvoicingDocument, type InvoicingDocumentProps } from '../../../../src/domain/invoicing/invoicingDocument.js';
import { nextAttemptAt } from '../../../../src/domain/invoicing/retrySchedule.js';

const NOW = new Date('2026-09-29T12:00:00.000Z');
const minutes = (count: number) => new Date(NOW.getTime() + count * 60_000);
const BUYER = { documentType: 'CC', documentNumber: '1020304050', firstName: 'Ana', lastName: 'Portera', email: 'ana@example.com', cityId: 'city-cali' };

function invoice(overrides: Partial<Parameters<typeof InvoicingDocument.create>[0]> = {}) {
  return InvoicingDocument.create({
    id: '0192f000-0000-7000-8000-000000000001',
    kind: 'invoice',
    concept: 'commission',
    goalkeeperId: 'gk-1',
    countryId: 'country-co',
    sourceEventId: 'e-1',
    sourceMovementId: 'm-1',
    vatMovementId: 'm-2',
    bookingId: 'b-1',
    requestId: 'r-1',
    originalDocumentId: null,
    base: 7000,
    vat: 1330,
    vatRateBps: 1900,
    currency: 'COP',
    buyer: BUYER,
    occurredAt: NOW,
    createdAt: NOW,
    ...overrides,
  });
}

describe('InvoicingDocument', () => {
  it('starts pending and due, with its total', () => {
    expect(invoice()).toMatchObject({ status: 'pending', total: 8330, attempts: 0, nextAttemptAt: NOW, provider: null, waitingFor: null });
  });

  it('makes a credit note wait for its original', () => {
    expect(invoice({ kind: 'credit_note', originalDocumentId: 'd-0' }).waitingFor).toBe('d-0');
  });

  it.each<[string, Partial<InvoicingDocumentProps>, RegExp]>([
    ['a zero base', { base: 0, vat: 0 }, /base/],
    ['a credit note without its original', { kind: 'credit_note' }, /credit note/],
    ['an invoice with an original', { originalDocumentId: 'd-0' }, /credit note/],
  ])('refuses %s', (_label, change, message) => {
    expect(() => InvoicingDocument.rehydrate({ ...invoice().toProps(), ...change } as InvoicingDocumentProps)).toThrow(message);
  });

  it('binds a provider once, and keeps it', () => {
    const bound = invoice().bindProvider('siigo', {}, NOW);

    expect(bound.provider).toEqual({ name: 'siigo', config: {}, id: null, number: null, cufe: null });
    expect(bound.bindProvider('siigo', {}, NOW)).toBe(bound);
    expect(() => bound.bindProvider('alegra', {}, NOW)).toThrow(/bound to siigo/);
  });

  it('is issued with the provider\'s number and CUFE', () => {
    const issued = invoice().bindProvider('siigo', {}, NOW).markIssued({ id: 'sg-1', number: 'FV-2-22', cufe: 'cufe-1' }, minutes(1));

    expect(issued).toMatchObject({
      status: 'issued',
      provider: { name: 'siigo', id: 'sg-1', number: 'FV-2-22', cufe: 'cufe-1' },
      issuedAt: minutes(1),
      nextAttemptAt: null,
    });
    expect(issued.isFinal()).toBe(true);
  });

  it('counts transient failures and schedules the next attempt', () => {
    const failed = invoice().markTransient({ code: 'provider_down', message: 'timeout' }, NOW, nextAttemptAt(1, NOW));

    expect(failed).toMatchObject({ status: 'pending', attempts: 1, nextAttemptAt: minutes(1), lastError: { kind: 'transient', code: 'provider_down' } });
  });

  it('is retried by an administrator only when rejected, with fresh buyer data', () => {
    const rejected = invoice().bindProvider('siigo', {}, NOW).markRejected({ code: 'buyer_city_not_coded', message: 'x' }, NOW);
    const retried = rejected.resetForRetry({ ...BUYER, cityId: 'city-medellin' }, minutes(5));

    expect(retried).toMatchObject({ status: 'pending', attempts: 0, nextAttemptAt: minutes(5), lastError: null, buyer: { cityId: 'city-medellin' } });
    expect(retried.provider?.name).toBe('siigo');
    expect(() => invoice().resetForRetry(BUYER, NOW)).toThrow(/not rejected/);
  });

  it('is stale after 24 hours without a final status', () => {
    expect(invoice().isStale(minutes(24 * 60))).toBe(false);
    expect(invoice().isStale(minutes(24 * 60 + 1))).toBe(true);
    expect(invoice().bindProvider('siigo', {}, NOW).markIssued({ id: 'x', number: null, cufe: null }, NOW).isStale(minutes(3000))).toBe(false);
  });

  it('has an alphanumeric idempotency key of at most 30 characters, stable per document', () => {
    const key = invoice().idempotencyKey();

    expect(key).toMatch(/^[0-9a-z]{1,30}$/);
    expect(invoice().idempotencyKey()).toBe(key);
    expect(invoice({ id: '0192f000-0000-7000-8000-000000000002' }).idempotencyKey()).not.toBe(key);
  });
});

describe('nextAttemptAt', () => {
  it.each<[number, number]>([
    [1, 1],
    [2, 5],
    [3, 15],
    [4, 60],
    [8, 1440],
    [20, 1440],
  ])('after %i failed attempts waits %i minutes', (attempts, wait) => {
    expect(nextAttemptAt(attempts, NOW)).toEqual(minutes(wait));
  });
});
