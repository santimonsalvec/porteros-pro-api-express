import { describe, expect, it } from 'vitest';
import { adminGet, documentWorld, memberWith } from '../financeTestHelpers.js';

// Admin spec 007, US2 (contracts/finance-api.md §6 and §8).

describe('admin invoicing documents (spec 007 of the admin, US2)', () => {
  it('lists oldest first with the goalkeeper and whether issuing is on, and filters', async () => {
    const { context, owner } = await documentWorld();

    const all = await adminGet(context, '/admin/invoicing/documents', owner.token);

    expect(all.status).toBe(200);
    expect(all.body).toMatchObject({ totalItems: 3, issuingEnabled: true });
    expect(all.body.items.map((item: { documentId: string }) => item.documentId)).toEqual(['inv-1', 'nc-1', 'rej-1']);
    const ids = async (query: string) => (await adminGet(context, `/admin/invoicing/documents?${query}`, owner.token)).body.items.map((item: { documentId: string }) => item.documentId);
    expect(await ids('status=rejected')).toEqual(['rej-1']);
    expect(await ids('kind=credit_note')).toEqual(['nc-1']);
    expect((await adminGet(context, '/admin/invoicing/documents', owner.token, 'country:country-mx')).body.items).toEqual([]);
    expect((await adminGet(context, '/admin/invoicing/documents?countryId=country-co', owner.token)).status).toBe(400);
    expect(await ids('from=2026-10-14T05:00:00.000Z')).toEqual(['rej-1']);
    expect(await ids('stale=true')).toEqual(['nc-1']);
  });

  it('gives the detail of an invoice with its credit notes, and of a credit note with its invoice', async () => {
    const { context, owner } = await documentWorld();

    const invoice = await adminGet(context, '/admin/invoicing/documents/inv-1', owner.token);
    const note = await adminGet(context, '/admin/invoicing/documents/nc-1', owner.token);

    expect(invoice.status).toBe(200);
    expect(invoice.body).toMatchObject({ documentId: 'inv-1', number: 'FE-1024', creditNotes: [{ documentId: 'nc-1' }], original: null, requestId: 'r-1' });
    expect(note.body).toMatchObject({ documentId: 'nc-1', original: { documentId: 'inv-1', number: 'FE-1024', status: 'issued' }, waitingFor: 'inv-1' });
    expect(JSON.stringify(invoice.body)).not.toMatch(/accessKey|username|secret/i);
  });

  it('answers 404 for an unknown document and 400 for malformed filters', async () => {
    const { context, owner } = await documentWorld();
    const missing = await adminGet(context, '/admin/invoicing/documents/nope', owner.token);
    expect(missing.status).toBe(404);
    expect(missing.body.error).toBe('invoicing_document_not_found');
    for (const query of ['kind=receipt', 'stale=maybe', 'from=ayer', 'from=2026-10-14T00:00:00.000Z&to=2026-10-13T00:00:00.000Z']) {
      const response = await adminGet(context, `/admin/invoicing/documents?${query}`, owner.token);
      expect(response.status, query).toBe(400);
    }
  });

  it('needs invoicing.read', async () => {
    const { context } = await documentWorld();
    const member = await memberWith(context, 'recargas', ['deposits.read']);
    expect((await adminGet(context, '/admin/invoicing/documents/inv-1', member.token)).status).toBe(403);
  });
});
