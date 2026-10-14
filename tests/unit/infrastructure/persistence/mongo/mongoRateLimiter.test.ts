import { describe, expect, it } from 'vitest';
import type { Db } from 'mongodb';
import { MongoRateLimiter } from '../../../../../src/infrastructure/persistence/mongo/mongoRateLimiter.js';
import { createFakeCollection } from '../../../../fakes/fakeMongoCollection.js';

const NOW = new Date('2026-10-14T15:00:00.000Z');
const HOUR_S = 3600;

function limiterWith(collection: ReturnType<typeof createFakeCollection>) {
  const names: string[] = [];
  const db = { collection: (name: string) => (names.push(name), collection) } as unknown as Db;
  return { limiter: new MongoRateLimiter(db), names };
}

const window = (count: number, startedSecondsAgo = 0) => ({
  _id: 'email-code:request:1.2.3.4',
  windowStart: new Date(NOW.getTime() - startedSecondsAgo * 1000),
  count,
});

describe('MongoRateLimiter (admin spec 009, research §6)', () => {
  it('counts each call in one atomic upsert in rateLimitWindows, restarting an expired window', async () => {
    const collection = createFakeCollection();
    collection.findOneAndUpdate.mockResolvedValue(window(1));
    const { limiter, names } = limiterWith(collection);

    expect(await limiter.tryConsume('email-code:request:1.2.3.4', 20, HOUR_S, NOW)).toEqual({ allowed: true });
    expect(names).toEqual(['rateLimitWindows']);

    const [filter, pipeline, options] = collection.findOneAndUpdate.mock.calls[0]!;
    const expired = { $lte: [{ $ifNull: ['$windowStart', new Date(0)] }, new Date(NOW.getTime() - HOUR_S * 1000)] };
    expect(filter).toEqual({ _id: 'email-code:request:1.2.3.4' });
    expect(pipeline).toEqual([
      { $set: { count: { $cond: [expired, 1, { $add: ['$count', 1] }] }, windowStart: { $cond: [expired, NOW, '$windowStart'] } } },
      { $set: { expiresAt: { $add: ['$windowStart', HOUR_S * 1000] } } },
    ]);
    expect(options).toEqual({ upsert: true, returnDocument: 'after' });
  });

  it('allows up to the limit and refuses beyond it until the window ends', async () => {
    const collection = createFakeCollection();
    collection.findOneAndUpdate.mockResolvedValueOnce(window(20, 600)).mockResolvedValueOnce(window(21, 600));
    const { limiter } = limiterWith(collection);

    expect(await limiter.tryConsume('k', 20, HOUR_S, NOW)).toEqual({ allowed: true });
    expect(await limiter.tryConsume('k', 20, HOUR_S, NOW)).toEqual({ allowed: false, retryAfterSeconds: HOUR_S - 600 });
  });

  it('retries once when two first calls create the same window at once', async () => {
    const collection = createFakeCollection();
    collection.findOneAndUpdate.mockRejectedValueOnce(Object.assign(new Error('E11000'), { code: 11000 })).mockResolvedValueOnce(window(2));

    expect(await limiterWith(collection).limiter.tryConsume('k', 20, HOUR_S, NOW)).toEqual({ allowed: true });
    expect(collection.findOneAndUpdate).toHaveBeenCalledTimes(2);
  });

  it('drops each window once it is over', async () => {
    const collection = createFakeCollection();
    collection.createIndex.mockResolvedValue('ok');

    await limiterWith(collection).limiter.ensureIndexes();

    expect(collection.createIndex).toHaveBeenCalledWith({ expiresAt: 1 }, { name: 'expiresAt_ttl', expireAfterSeconds: 0 });
  });
});
