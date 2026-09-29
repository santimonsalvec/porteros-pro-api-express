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
