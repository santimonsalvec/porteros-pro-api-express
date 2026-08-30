import { describe, expect, it } from 'vitest';
import { MongoConnectionProvider } from '../../../../../src/infrastructure/persistence/mongo/mongoConnectionProvider.js';

describe('MongoConnectionProvider', () => {
  it('fails fast when the connection string is empty', () => {
    expect(() => new MongoConnectionProvider('')).toThrow(/MONGODB_CONNECTION_STRING/);
  });

  it('fails fast when the connection string is malformed', () => {
    expect(() => new MongoConnectionProvider('not-a-valid-uri')).toThrow();
  });

  it('exposes the same shared Db instance across calls (singleton) without connecting', () => {
    const provider = new MongoConnectionProvider('mongodb://localhost:27017/porterospro');

    const dbA = provider.getDb();
    const dbB = provider.getDb();

    expect(dbA).toBe(dbB);
  });
});
