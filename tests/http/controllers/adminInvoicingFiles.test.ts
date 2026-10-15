import { describe, expect, it } from 'vitest';
import { adminGet, documentWorld, memberWith } from '../financeTestHelpers.js';

// Admin spec 007, US2 (FR-009, contracts/finance-api.md §9): files of a document, a sensitive read.

describe('admin invoicing files (spec 007 of the admin, FR-009)', () => {
  it('downloads the PDF and records who looked, without the file', async () => {
    const { context, owner } = await documentWorld();
    context.adminAuditLog.entries.length = 0;

    const response = await adminGet(context, '/admin/invoicing/documents/inv-1/pdf', owner.token);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/^application\/pdf/);
    expect(response.headers['content-disposition']).toBe('attachment; filename="factura-FE-1024.pdf"');
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(context.adminAuditLog.entries).toEqual([
      expect.objectContaining({ kind: 'read', action: 'invoicingDocument.pdf.read', resourceType: 'invoicingDocument', resourceId: 'inv-1', outcome: 'done', httpStatus: 200 }),
    ]);
    expect(JSON.stringify(context.adminAuditLog.entries)).not.toContain('1020304050');
  });

  it('records a failed download too, and says why', async () => {
    const { context, owner } = await documentWorld();
    context.adminAuditLog.entries.length = 0;

    const noXml = await adminGet(context, '/admin/invoicing/documents/inv-1/xml', owner.token);
    const pending = await adminGet(context, '/admin/invoicing/documents/nc-1/pdf', owner.token);
    const missing = await adminGet(context, '/admin/invoicing/documents/nope/pdf', owner.token);

    expect([noXml.status, noXml.body.error]).toEqual([404, 'file_not_available']);
    expect([pending.status, pending.body.error]).toEqual([409, 'document_not_issued']);
    expect([missing.status, missing.body.error]).toEqual([404, 'invoicing_document_not_found']);
    expect(context.adminAuditLog.entries.map((entry) => [entry.action, entry.outcome])).toEqual([
      ['invoicingDocument.xml.read', 'rejected'],
      ['invoicingDocument.pdf.read', 'rejected'],
      ['invoicingDocument.pdf.read', 'rejected'],
    ]);
  });

  it('says the provider is down', async () => {
    const { context, owner } = await documentWorld();
    context.invoicingProvider.script('transient');
    const response = await adminGet(context, '/admin/invoicing/documents/inv-1/pdf', owner.token);
    expect([response.status, response.body.error]).toEqual([503, 'provider_unavailable']);
  });

  it('refuses without invoicing.read and leaves a denial, not a read', async () => {
    const { context } = await documentWorld();
    const member = await memberWith(context, 'recargas', ['deposits.read']);
    context.adminAuditLog.entries.length = 0;

    expect((await adminGet(context, '/admin/invoicing/documents/inv-1/pdf', member.token)).status).toBe(403);
    expect(context.adminAuditLog.entries).toEqual([expect.objectContaining({ outcome: 'denied', permission: 'invoicing.read' })]);
  });
});
