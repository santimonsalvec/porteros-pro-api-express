import { describe, expect, it } from 'vitest';
import type { Collection, Db, Document } from 'mongodb';
import { SupportCase } from '../../../../../src/domain/cases/case.js';
import { Rating } from '../../../../../src/domain/ratings/rating.js';
import { CaseRepository, caseFromDocument, caseToDocument } from '../../../../../src/infrastructure/persistence/mongo/caseRepository.js';
import { RatingRepository, ratingFromDocument, ratingToDocument } from '../../../../../src/infrastructure/persistence/mongo/ratingRepository.js';
import { createFakeCollection, toArrayCursor, toArrayResult } from '../../../../fakes/fakeMongoCollection.js';

const dbOf = (collection: ReturnType<typeof createFakeCollection>) => ({ collection: () => collection as unknown as Collection<Document> }) as unknown as Db;
const at = new Date('2026-10-05T00:00:00.000Z');
const rating = Rating.create({ id: 'r-1', bookingId: 'b-1', requestId: 'q-1', side: 'client', authorId: 'c', subjectId: 'g', answer: false, stars: 2, comment: 'No vino', createdAt: at });
const opened = SupportCase.open({ id: 'c-1', type: 'goalkeeper_no_show', bookingId: 'b-1', requestId: 'q-1', clientId: 'c', goalkeeperId: 'g', ratingId: 'r-1', checkIn: null, noShowIncidentId: 'w-1', createdAt: at });

describe('RatingRepository and CaseRepository (mocked driver, feature 021)', () => {
  it('maps ratings and cases both ways', () => {
    expect(ratingFromDocument(ratingToDocument(rating))).toEqual(rating);
    expect(caseFromDocument(caseToDocument(opened))).toEqual(opened);
  });

  it('creates the uniqueness and listing indexes', async () => {
    const ratings = createFakeCollection();
    const cases = createFakeCollection();
    await new RatingRepository(dbOf(ratings)).ensureIndexes();
    await new CaseRepository(dbOf(cases)).ensureIndexes();

    expect(ratings.createIndex).toHaveBeenCalledWith({ bookingId: 1, side: 1 }, { name: 'booking_side_unique', unique: true });
    expect(ratings.createIndex).toHaveBeenCalledWith({ subjectId: 1, side: 1 }, { name: 'subject_side' });
    expect(cases.createIndex).toHaveBeenCalledWith({ bookingId: 1, type: 1 }, { name: 'booking_type_unique', unique: true });
    expect(cases.createIndex).toHaveBeenCalledWith({ status: 1, createdAt: -1 }, { name: 'status_created' });
  });

  it('reads the ratings of some bookings for one side', async () => {
    const collection = createFakeCollection();
    collection.find.mockReturnValue(toArrayResult([ratingToDocument(rating)]));

    expect(await new RatingRepository(dbOf(collection)).findByBookingsAndSide(['b-1'], 'client')).toEqual([rating]);
    expect(collection.find).toHaveBeenCalledWith({ bookingId: { $in: ['b-1'] }, side: 'client' });
    expect(await new RatingRepository(dbOf(collection)).findByBookingsAndSide([], 'client')).toEqual([]);
  });

  it('lists cases open first and resolves each once', async () => {
    const collection = createFakeCollection();
    const cursor = toArrayCursor([caseToDocument(opened)]);
    collection.find.mockReturnValue(cursor);
    collection.updateOne.mockResolvedValueOnce({ modifiedCount: 1 }).mockResolvedValueOnce({ modifiedCount: 0 }).mockResolvedValueOnce({ modifiedCount: 0 });
    collection.countDocuments.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    const repository = new CaseRepository(dbOf(collection));

    expect(await repository.list('open', 0, 20)).toEqual([opened]);
    expect(collection.find).toHaveBeenCalledWith({ status: 'open' });
    expect(cursor.sort).toHaveBeenCalledWith({ status: 1, createdAt: -1, _id: -1 });
    const resolution = { by: 'admin-1', at, note: 'Revisado' };
    expect(await repository.resolve('c-1', resolution)).toBe('resolved');
    expect(collection.updateOne).toHaveBeenCalledWith({ _id: 'c-1', status: 'open' }, { $set: { status: 'resolved', resolution } });
    expect(await repository.resolve('c-1', resolution)).toBe('already_resolved');
    expect(await repository.resolve('missing', resolution)).toBe('not_found');
  });
});

describe('the admin ratings list index (admin spec 006, data-model)', () => {
  it('lists ratings newest first', async () => {
    const ratings = createFakeCollection();
    await new RatingRepository(dbOf(ratings)).ensureIndexes();

    expect(ratings.createIndex).toHaveBeenCalledWith({ createdAt: -1, _id: -1 }, { name: 'createdAt_id' });
  });
});

describe("the admin's case filters (admin spec 006, US2)", () => {
  const from = new Date('2026-10-01T05:00:00.000Z');
  const to = new Date('2026-10-20T05:00:00.000Z');

  it('searches by status, type, opening dates and requests, in the default order', async () => {
    const cases = createFakeCollection();
    const cursor = toArrayCursor([caseToDocument(opened)]);
    cases.find.mockReturnValue(cursor);

    const found = await new CaseRepository(dbOf(cases)).search({ status: 'open', type: 'goalkeeper_no_show', from, to, requestIds: ['q-1'], order: 'default' }, 20, 20);

    expect(found).toEqual([opened]);
    expect(cases.find).toHaveBeenCalledWith({ status: 'open', type: 'goalkeeper_no_show', createdAt: { $gte: from, $lt: to }, requestId: { $in: ['q-1'] } });
    expect(cursor.sort).toHaveBeenCalledWith({ status: 1, createdAt: -1, _id: -1 });
    expect(cursor.skip).toHaveBeenCalledWith(20);
    expect(cursor.limit).toHaveBeenCalledWith(20);
  });

  it('orders the oldest first on demand, and filters nothing without filters', async () => {
    const cases = createFakeCollection();
    const cursor = toArrayCursor([]);
    cases.find.mockReturnValue(cursor);

    await new CaseRepository(dbOf(cases)).search({ status: null, order: 'oldest' }, 0, 20);

    expect(cases.find).toHaveBeenCalledWith({});
    expect(cursor.sort).toHaveBeenCalledWith({ createdAt: 1, _id: 1 });
  });

  it('counts the same matches, and gives their requests', async () => {
    const cases = createFakeCollection();
    cases.countDocuments.mockResolvedValue(3);
    cases.distinct.mockResolvedValue(['q-1', 'q-2']);
    const repository = new CaseRepository(dbOf(cases));

    expect(await repository.countMatching({ status: 'resolved', order: 'default' })).toBe(3);
    expect(cases.countDocuments).toHaveBeenCalledWith({ status: 'resolved' });
    expect(await repository.requestIdsMatching({ status: 'open', type: 'payment_not_received', order: 'default' })).toEqual(['q-1', 'q-2']);
    expect(cases.distinct).toHaveBeenCalledWith('requestId', { status: 'open', type: 'payment_not_received' });
  });
});

describe("the admin's case filters, one side of the dates at a time", () => {
  it('filters from a date, or up to one', async () => {
    const cases = createFakeCollection();
    cases.countDocuments.mockResolvedValue(0);
    const repository = new CaseRepository(dbOf(cases));
    const day = new Date('2026-10-01T05:00:00.000Z');

    await repository.countMatching({ status: null, from: day, order: 'default' });
    await repository.countMatching({ status: null, to: day, order: 'default' });

    expect(cases.countDocuments).toHaveBeenNthCalledWith(1, { createdAt: { $gte: day } });
    expect(cases.countDocuments).toHaveBeenNthCalledWith(2, { createdAt: { $lt: day } });
  });
});

describe('CaseRepository.findOpenForParticipant (feature 029)', () => {
  it('reads the open cases of a user as client or as goalkeeper, newest first', async () => {
    const collection = createFakeCollection();
    const cursor = { sort: () => cursor, toArray: async () => [caseToDocument(opened)] };
    collection.find.mockReturnValue(cursor);

    expect(await new CaseRepository(dbOf(collection)).findOpenForParticipant('g')).toEqual([opened]);
    expect(collection.find).toHaveBeenCalledWith({ status: 'open', $or: [{ goalkeeperId: 'g' }, { clientId: 'g' }] });
  });
});
