import { describe, expect, it } from 'vitest';
import { adminGet, documentWorld } from '../financeTestHelpers.js';

// Admin spec 007, US2 (FR-024, contracts/finance-api.md §7).

describe('admin invoicing export (spec 007 of the admin, FR-024)', () => {
  it('sends the documents as a CSV without the buyer document nor email, and audits it', async () => {
    const { context, owner } = await documentWorld();
    context.adminAuditLog.entries.length = 0;

    const response = await adminGet(context, '/admin/invoicing/documents/export?kind=invoice', owner.token);

    expect(response.status).toBe(200);
    expect(response.headers['content-disposition']).toMatch(/^attachment; filename="facturacion-\d{4}-\d{2}-\d{2}\.csv"$/);
    const lines = response.text.split('\r\n').filter(Boolean);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('fecha;zona_horaria;tipo;concepto;numero');
    expect(response.text).not.toContain('1020304050');
    expect(response.text).not.toContain('juan@x.co');
    expect(context.adminAuditLog.entries).toEqual([
      expect.objectContaining({ kind: 'read', action: 'invoicingDocuments.export', request: { kind: 'invoice', rows: 2 } }),
    ]);
  });

  it('refuses more than 10.000 rows', async () => {
    const { context, owner } = await documentWorld();
    const first = context.invoicingDocumentRepository.all()[0]!;
    const all = context.invoicingDocumentRepository.all.bind(context.invoicingDocumentRepository);
    context.invoicingDocumentRepository.all = () => [...all(), ...Array.from({ length: 10_000 }, () => first)];

    const response = await adminGet(context, '/admin/invoicing/documents/export', owner.token);

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ error: 'export_too_large', count: 10_003, limit: 10_000 });
  });
});
