import { describe, expect, it } from 'vitest';
import type { Collection, Db, Document } from 'mongodb';
import { Rating } from '../../../../../src/domain/ratings/rating.js';
import { RatingAdminReader } from '../../../../../src/infrastructure/persistence/mongo/ratingAdminReader.js';
import { ratingToDocument } from '../../../../../src/infrastructure/persistence/mongo/ratingRepository.js';
import { createFakeCollection, toArrayCursor, toArrayResult, type FakeMongoCollection } from '../../../../fakes/fakeMongoCollection.js';

const AT = new Date('2026-10-19T15:00:00.000Z');
const rating = Rating.create({ id: 'rt-1', bookingId: 'b-1', requestId: 'q-1', side: 'client', authorId: 'c-1', subjectId: 'gk-1', answer: false, stars: 2, comment: 'Llegó tarde', createdAt: AT });

function readerWith(collections: Record<string, FakeMongoCollection>) {
  const db = { collection: (name: string) => (collections[name] ?? createFakeCollection()) as unknown as Collection<Document> } as unknown as Db;
  return new RatingAdminReader(db);
}

describe('RatingAdminReader (mocked driver, admin spec 006)', () => {
  it('lists a page of ratings newest first, with the total', async () => {
    const ratings = createFakeCollection();
    const cursor = toArrayCursor([ratingToDocument(rating)]);
    ratings.find.mockReturnValue(cursor);
    ratings.countDocuments.mockResolvedValue(9);

    const result = await readerWith({ ratings }).list({ side: 'client', page: 2, pageSize: 20 });

    expect(result).toEqual({ items: [rating], totalItems: 9 });
    expect(ratings.find).toHaveBeenCalledWith({ side: 'client' });
    expect(cursor.sort).toHaveBeenCalledWith({ createdAt: -1, _id: -1 });
    expect(cursor.skip).toHaveBeenCalledWith(20);
    expect(cursor.limit).toHaveBeenCalledWith(20);
    expect(ratings.countDocuments).toHaveBeenCalledWith({ side: 'client' });
  });

  it('finds the case each rating opened, by its booking', async () => {
    const cases = createFakeCollection();
    cases.find.mockReturnValue(toArrayResult([{ _id: 'case-1', bookingId: 'b-1', ratingId: 'rt-1' }, { _id: 'case-2', bookingId: 'b-1', ratingId: 'rt-9' }]));
    const reader = readerWith({ cases });

    expect(await reader.casesOpenedBy([rating])).toEqual(new Map([['rt-1', 'case-1']]));
    expect(cases.find).toHaveBeenCalledWith({ bookingId: { $in: ['b-1'] } }, { projection: { _id: 1, ratingId: 1 } });
    expect(await reader.casesOpenedBy([])).toEqual(new Map());
    expect(cases.find).toHaveBeenCalledTimes(1);
  });
});
