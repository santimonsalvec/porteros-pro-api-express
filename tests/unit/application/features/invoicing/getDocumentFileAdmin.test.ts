import { describe, expect, it } from 'vitest';
import { GetDocumentFileQuery } from '../../../../../src/application/features/invoicing/queries/getDocumentFile/getDocumentFileQuery.js';
import { GetDocumentFileQueryHandler } from '../../../../../src/application/features/invoicing/queries/getDocumentFile/getDocumentFileQueryHandler.js';
import { buildDocument } from '../../../../fixtures/invoicingAdminFixtures.js';
import { InvoicingHarness } from './invoicingHarness.js';

// Admin spec 007, US2 (FR-009): an administrator downloads any issued document's file.

describe('GetDocumentFileQueryHandler for the admin', () => {
  const issued = buildDocument({ id: 'inv-1', status: 'issued', provider: { name: 'siigo', config: {}, id: 's-1', number: 'FE-1024', cufe: 'c' } });

  it("reads any goalkeeper's issued document when no goalkeeper is given", async () => {
    const harness = new InvoicingHarness();
    harness.documents.put(issued);
    harness.provider.files.set('s-1:pdf', { content: Buffer.from('%PDF'), contentType: 'application/pdf', fileName: 'FE-1024.pdf' });

    const result = await new GetDocumentFileQueryHandler(harness.deps).handle(new GetDocumentFileQuery(null, 'inv-1', 'pdf'));

    expect(result.outcome).toBe('success');
    expect(harness.logger.entries.find((entry) => entry.entry.outcome === 'invoicing_file_read')?.entry).toEqual({ outcome: 'invoicing_file_read', documentId: 'inv-1', kind: 'pdf' });
  });

  it("still keeps a goalkeeper to their own documents", async () => {
    const harness = new InvoicingHarness();
    harness.documents.put(issued);

    expect(await new GetDocumentFileQueryHandler(harness.deps).handle(new GetDocumentFileQuery('gk-2', 'inv-1', 'pdf'))).toEqual({ outcome: 'not_found' });
  });

  it('answers not_issued for a pending document, as before', async () => {
    const harness = new InvoicingHarness();
    harness.documents.put(buildDocument({ id: 'p-1' }));

    expect(await new GetDocumentFileQueryHandler(harness.deps).handle(new GetDocumentFileQuery(null, 'p-1', 'xml'))).toEqual({ outcome: 'not_issued', status: 'pending' });
  });
});
