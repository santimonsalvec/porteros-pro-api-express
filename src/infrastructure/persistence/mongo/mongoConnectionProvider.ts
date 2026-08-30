import { MongoClient, type Db } from 'mongodb';
import { config } from '../../config.js';

/**
 * Holds the single shared MongoDB client/database for the application's lifetime
 * (FR-003). Constructing this validates and connects the client eagerly-enough to
 * fail fast on a missing/malformed connection string (FR-004), without requiring a
 * live round-trip to the server before the first real operation.
 */
export class MongoConnectionProvider {
  private readonly client: MongoClient;
  private readonly db: Db;

  constructor(connectionString: string = config.mongoConnectionString()) {
    if (!connectionString || connectionString.trim() === '') {
      throw new Error('MONGODB_CONNECTION_STRING is required and must not be empty.');
    }
    this.client = new MongoClient(connectionString);
    this.db = this.client.db();
  }

  getDb(): Db {
    return this.db;
  }

  async connect(): Promise<void> {
    await this.client.connect();
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}
