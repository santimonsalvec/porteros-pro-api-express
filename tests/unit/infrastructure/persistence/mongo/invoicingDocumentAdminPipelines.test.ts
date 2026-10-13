import { describe, expect, it } from 'vitest';
import type { Collection, Db, Document } from 'mongodb';
import { DOCUMENT_ADMIN_SORT, documentAdminFilter } from '../../../../../src/infrastructure/persistence/mongo/invoicingDocumentAdminPipelines.js';
import { InvoicingDocumentRepository } from '../../../../../src/infrastructure/persistence/mongo/invoicingDocumentRepository.js';
import { createFakeCollection } from '../../../../fakes/fakeMongoCollection.js';

// Admin spec 007, US2 (research §5): the documents' filters, oldest first as today, and the indexes.

const NOW = new Date('2026-10-13T14:00:00.000Z');

describe('documentAdminFilter', () => {
  it('is what the list asked before when only the status is given', () => {
    expect(documentAdminFilter({}, NOW)).toEqual({});
    expect(documentAdminFilter({ status: 'rejected' }, NOW)).toEqual({ status: 'rejected' });
  });

  it('combines kind, country and the date of the charge ([from, to))', () => {
    const from = new Date('2026-10-01T05:00:00.000Z');
    const to = new Date('2026-10-14T05:00:00.000Z');
    expect(documentAdminFilter({ kind: 'credit_note', countryId: 'country-co', from, to }, NOW)).toEqual({
      kind: 'credit_note',
      countryId: 'country-co',
      occurredAt: { $gte: from, $lt: to },
    });
  });

  it('finds documents waiting more than 24 hours, as isStale does', () => {
    expect(documentAdminFilter({ stale: true }, NOW)).toEqual({
      $and: [{ status: { $in: ['pending', 'awaiting_authority'] } }, { createdAt: { $lt: new Date('2026-10-12T14:00:00.000Z') } }],
    });
    expect(documentAdminFilter({ stale: true, status: 'pending' }, NOW)).toEqual({
      status: 'pending',
      $and: [{ status: { $in: ['pending', 'awaiting_authority'] } }, { createdAt: { $lt: new Date('2026-10-12T14:00:00.000Z') } }],
    });
  });

  it('keeps the order of the list as it was: oldest first', () => {
    expect(DOCUMENT_ADMIN_SORT).toEqual({ createdAt: 1, _id: 1 });
  });
});

describe('InvoicingDocumentRepository admin indexes', () => {
  it('creates them apart from the existing ones', async () => {
    const collection = createFakeCollection();
    collection.createIndex.mockResolvedValue('ok');
    const db = { collection: () => collection as unknown as Collection<Document> } as unknown as Db;

    await new InvoicingDocumentRepository(db).ensureAdminIndexes();

    expect(collection.createIndex.mock.calls).toEqual([
      [{ status: 1, createdAt: 1, _id: 1 }, { name: 'status_created' }],
      [{ countryId: 1, createdAt: 1, _id: 1 }, { name: 'country_created' }],
      [{ occurredAt: 1 }, { name: 'occurred' }],
      [{ originalDocumentId: 1 }, { name: 'original', partialFilterExpression: { originalDocumentId: { $type: 'string' } } }],
    ]);
  });
});
