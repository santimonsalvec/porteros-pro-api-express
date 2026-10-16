import { describe, expect, it, vi } from 'vitest';
import type { Collection, Db, Document } from 'mongodb';
import { InvoicingDocument } from '../../../../../src/domain/invoicing/invoicingDocument.js';
import { InvoicingSettings } from '../../../../../src/domain/invoicing/invoicingSettings.js';
import { BillableMovementScanner } from '../../../../../src/infrastructure/persistence/mongo/billableMovementScanner.js';
import {
  InvoicingDocumentRepository,
  invoicingDocumentToDocument,
} from '../../../../../src/infrastructure/persistence/mongo/invoicingDocumentRepository.js';
import { InvoicingSettingsRepository } from '../../../../../src/infrastructure/persistence/mongo/invoicingSettingsRepository.js';
import { createFakeCollection, toArrayCursor } from '../../../../fakes/fakeMongoCollection.js';

const NOW = new Date('2026-09-29T12:00:00.000Z');
const BUYER = { documentType: 'CC', documentNumber: '1', firstName: 'Ana', lastName: 'P', email: 'a@e.co', cityId: 'city-cali', address: null, addressComplement: null };

function dbWith(collection: ReturnType<typeof createFakeCollection>): Db {
  return { collection: () => collection as unknown as Collection<Document> } as unknown as Db;
}

const document = InvoicingDocument.create({
  id: '0192f000-0000-7000-8000-000000000001',
  kind: 'invoice',
  concept: 'commission',
  goalkeeperId: 'gk-1',
  countryId: 'country-co',
  marketId: 'city-cali',
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
});

describe('InvoicingDocumentRepository (mocked driver)', () => {
  it('creates its indexes', async () => {
    const collection = createFakeCollection();
    collection.createIndex.mockResolvedValue('ok');

    await new InvoicingDocumentRepository(dbWith(collection)).ensureIndexes();

    expect(collection.createIndex.mock.calls).toEqual([
      [{ sourceMovementId: 1 }, { name: 'source_unique', unique: true }],
      [{ goalkeeperId: 1, occurredAt: -1, _id: -1 }, { name: 'goalkeeper_occurred' }],
      [{ marketId: 1, issuedAt: -1 }, { name: 'market_issued' }],
      [{ status: 1, nextAttemptAt: 1 }, { name: 'status_next' }],
    ]);
  });

  it('creates a document once: a duplicate source answers the existing one', async () => {
    const collection = createFakeCollection();
    collection.insertOne.mockResolvedValueOnce({}).mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 11000, keyPattern: { sourceMovementId: 1 } }));
    collection.findOne.mockResolvedValue(invoicingDocumentToDocument(document));
    const repository = new InvoicingDocumentRepository(dbWith(collection));

    expect(await repository.createIfAbsent(document)).toMatchObject({ created: true });
    const second = await repository.createIfAbsent(document);

    expect(second.created).toBe(false);
    expect(second.document.toProps()).toEqual(document.toProps());
    expect(collection.findOne).toHaveBeenCalledWith({ sourceMovementId: 'm-1' });
  });

  it('writes a change only while the status is the one read', async () => {
    const collection = createFakeCollection();
    collection.updateOne.mockResolvedValueOnce({ matchedCount: 1 }).mockResolvedValueOnce({ matchedCount: 0 });
    const repository = new InvoicingDocumentRepository(dbWith(collection));
    const issued = document.bindProvider('siigo', {}, NOW).markIssued({ id: 'sg-1', number: 'FV-1', cufe: 'c' }, NOW);

    expect(await repository.update(issued, 'pending')).toBe(true);
    expect(await repository.update(issued, 'pending')).toBe(false);
    expect(collection.updateOne.mock.calls[0]![0]).toEqual({ _id: document.id, status: 'pending' });
    expect(collection.updateOne.mock.calls[0]![1]).toMatchObject({ $set: { status: 'issued', provider: { name: 'siigo', id: 'sg-1' } } });
  });

  it('finds due pending and awaiting documents, and counts stale ones', async () => {
    const collection = createFakeCollection();
    const cursor = toArrayCursor([invoicingDocumentToDocument(document)]);
    collection.find.mockReturnValue(cursor);
    collection.countDocuments.mockResolvedValue(3);
    const repository = new InvoicingDocumentRepository(dbWith(collection));

    expect(await repository.findDue(NOW, 10)).toHaveLength(1);
    expect(collection.find).toHaveBeenLastCalledWith({ status: 'pending', nextAttemptAt: { $lte: NOW } });
    await repository.findAwaiting(NOW, 10);
    expect(collection.find).toHaveBeenLastCalledWith({ status: 'awaiting_authority', nextAttemptAt: { $lte: NOW } });
    expect(await repository.countStale(NOW)).toBe(3);
    expect(collection.countDocuments).toHaveBeenCalledWith({ status: { $in: ['pending', 'awaiting_authority'] }, createdAt: { $lt: NOW } });
  });

  it('lists a goalkeeper\'s documents newest first', async () => {
    const collection = createFakeCollection();
    const cursor = toArrayCursor([]);
    collection.find.mockReturnValue(cursor);

    await new InvoicingDocumentRepository(dbWith(collection)).listForGoalkeeper('gk-1', 20, 10);

    expect(collection.find).toHaveBeenCalledWith({ goalkeeperId: 'gk-1' });
    expect(cursor.sort).toHaveBeenCalledWith({ occurredAt: -1, _id: -1 });
  });
});

describe('InvoicingSettingsRepository (mocked driver)', () => {
  // Admin spec 007 (FR-025): a country's first provider is created at revision 0; later saves name the revision read.
  it('creates and reads a country\'s provider', async () => {
    const collection = createFakeCollection();
    collection.insertOne.mockResolvedValue({});
    const config = { partnerId: 'P', invoiceDocumentId: 1, creditNoteDocumentId: 2, sellerId: 3, commissionProductCode: 'C', penaltyProductCode: 'PN', vatTaxId: 4, paymentMethodId: 5 };
    const created = InvoicingSettings.create({ countryId: 'country-co', provider: 'siigo', config, updatedAt: NOW, updatedBy: 'admin-1' });
    if (!created.ok) throw new Error('invalid');
    const repository = new InvoicingSettingsRepository(dbWith(collection));

    expect(await repository.create(created.settings)).toBe('saved');
    collection.findOne.mockResolvedValue(collection.insertOne.mock.calls[0]![0]);

    expect(collection.insertOne.mock.calls[0]![0]).toMatchObject({ _id: 'country-co', revision: 0 });
    expect(await repository.getByCountry('country-co')).toMatchObject({ provider: 'siigo', config, revision: 0 });
  });

  it('updates only at the revision read, and answers stale otherwise or on a second create', async () => {
    const collection = createFakeCollection();
    collection.updateOne.mockResolvedValueOnce({ matchedCount: 1 }).mockResolvedValueOnce({ matchedCount: 0 });
    collection.insertOne.mockRejectedValue(Object.assign(new Error('E11000'), { code: 11000 }));
    const config = { partnerId: 'P', invoiceDocumentId: 1, creditNoteDocumentId: 2, sellerId: 3, commissionProductCode: 'C', penaltyProductCode: 'PN', vatTaxId: 4, paymentMethodId: 5 };
    const created = InvoicingSettings.create({ countryId: 'country-co', provider: 'siigo', config, updatedAt: NOW, updatedBy: 'admin-1' });
    if (!created.ok) throw new Error('invalid');
    const repository = new InvoicingSettingsRepository(dbWith(collection));

    expect(await repository.update(created.settings, 0)).toBe('saved');
    expect(collection.updateOne).toHaveBeenCalledWith(
      { _id: 'country-co', $or: [{ revision: 0 }, { revision: { $exists: false } }] },
      { $set: { provider: 'siigo', config, updatedAt: NOW, updatedBy: 'admin-1' }, $inc: { revision: 1 } },
    );
    expect(await repository.update(created.settings, 0)).toBe('stale');
    expect(await repository.create(created.settings)).toBe('stale');
  });
});

describe('InvoicingSettingsRepository revision edges (admin spec 007)', () => {
  const config = { partnerId: 'P', invoiceDocumentId: 1, creditNoteDocumentId: 2, sellerId: 3, commissionProductCode: 'C', penaltyProductCode: 'PN', vatTaxId: 4, paymentMethodId: 5 };

  it('updates at a later revision by its number, and lets other insert errors through', async () => {
    const collection = createFakeCollection();
    collection.updateOne.mockResolvedValue({ matchedCount: 1 });
    collection.insertOne.mockRejectedValue(new Error('network'));
    const created = InvoicingSettings.create({ countryId: 'country-co', provider: 'siigo', config, updatedAt: NOW, updatedBy: 'admin-1' });
    if (!created.ok) throw new Error('invalid');
    const repository = new InvoicingSettingsRepository(dbWith(collection));

    expect(await repository.update(created.settings, 4)).toBe('saved');
    expect(collection.updateOne.mock.calls[0]![0]).toEqual({ _id: 'country-co', revision: 4 });
    await expect(repository.create(created.settings)).rejects.toThrow('network');
  });

  it('reads an old document without revision as revision 0, and none as null', async () => {
    const collection = createFakeCollection();
    collection.findOne.mockResolvedValueOnce({ _id: 'country-co', provider: 'siigo', config, updatedAt: NOW, updatedBy: 'admin-1' }).mockResolvedValueOnce(null);
    const repository = new InvoicingSettingsRepository(dbWith(collection));

    expect((await repository.getByCountry('country-co'))?.revision).toBe(0);
    expect(await repository.getByCountry('country-pe')).toBeNull();
  });
});

describe('BillableMovementScanner (mocked driver)', () => {
  it('looks up billable movements of the last 7 days that have no document', async () => {
    const collection = createFakeCollection() as ReturnType<typeof createFakeCollection> & { aggregate: ReturnType<typeof vi.fn> };
    collection.aggregate = vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([{ _id: 'm-9', type: 'commission_charge' }]) });

    const found = await new BillableMovementScanner(dbWith(collection)).findWithoutDocument(NOW, 50);

    expect(found).toEqual([{ movementId: 'm-9', type: 'commission_charge' }]);
    const pipeline = collection.aggregate.mock.calls[0]![0] as Document[];
    expect(pipeline[0]).toEqual({
      $match: {
        type: { $in: ['commission_charge', 'commission_refund', 'penalty', 'penalty_reversal'] },
        occurredAt: { $lte: NOW, $gte: new Date(NOW.getTime() - 7 * 24 * 60 * 60_000) },
      },
    });
    expect(pipeline).toContainEqual({ $lookup: { from: 'invoicingDocuments', localField: '_id', foreignField: 'sourceMovementId', as: 'documents' } });
    expect(pipeline).toContainEqual({ $match: { documents: { $size: 0 } } });
    expect(pipeline).toContainEqual({ $limit: 50 });
  });
});
