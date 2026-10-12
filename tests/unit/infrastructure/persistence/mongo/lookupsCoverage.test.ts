import { describe, expect, it } from 'vitest';
import type { Collection, Db, Document } from 'mongodb';
import { GoalkeeperProfileRepository } from '../../../../../src/infrastructure/persistence/mongo/goalkeeperProfileRepository.js';
import { GoalkeeperRegistrationRepository } from '../../../../../src/infrastructure/persistence/mongo/goalkeeperRegistrationRepository.js';
import { RatingRepository } from '../../../../../src/infrastructure/persistence/mongo/ratingRepository.js';
import { createFakeCollection, toArrayResult } from '../../../../fakes/fakeMongoCollection.js';

const dbOf = (collection: ReturnType<typeof createFakeCollection>) => ({ collection: () => collection as unknown as Collection<Document> }) as unknown as Db;
const AT = new Date('2026-10-12T15:00:00.000Z');

describe('single lookups the admin relies on (admin spec 005)', () => {
  it('reads the offer candidates of some zones', async () => {
    const collection = createFakeCollection();
    collection.find.mockReturnValue(
      toArrayResult([{
        _id: 'gp', userId: 'g1', documentType: 'CC', documentNumber: '1', issueDate: AT, birthDate: AT, documentPhotoAId: 'a', documentPhotoBId: 'b',
        heightCm: 180, weightKg: 80, cityId: 'med', zoneIds: ['z1'], activatedAt: AT,
      }]),
    );

    expect((await new GoalkeeperProfileRepository(dbOf(collection)).findOfferCandidates(['z1'])).map((profile) => profile.userId)).toEqual(['g1']);
  });

  it("reads a user's registration, or nothing", async () => {
    const collection = createFakeCollection();
    collection.findOne.mockResolvedValueOnce({ _id: 'r', userId: 'u1', status: 'in_progress', identification: {}, physicalData: {}, availability: { zoneIds: [] }, createdAt: AT, updatedAt: AT });
    collection.findOne.mockResolvedValueOnce(null);
    const repository = new GoalkeeperRegistrationRepository(dbOf(collection));

    expect((await repository.getByUserId('u1'))?.userId).toBe('u1');
    expect(await repository.getByUserId('u2')).toBeNull();
  });

  it('reads a rating by id, or nothing', async () => {
    const collection = createFakeCollection();
    collection.findOne.mockResolvedValueOnce({ _id: 'rt', bookingId: 'b', requestId: 'r', side: 'client', authorId: 'c', subjectId: 'g', answer: true, stars: 5, comment: null, createdAt: AT });
    collection.findOne.mockResolvedValueOnce(null);
    const repository = new RatingRepository(dbOf(collection));

    expect((await repository.getById('rt'))?.stars).toBe(5);
    expect(await repository.getById('none')).toBeNull();
  });
});
