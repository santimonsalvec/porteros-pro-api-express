/**
 * Seeds the playing surfaces clients can pick (feature 024) into the database of this machine's
 * MONGODB_CONNECTION_STRING. Idempotent: it upserts each default by id and never touches other
 * surfaces, so ones added by hand (or deactivated with `active: false`) are kept as they are.
 *
 *   npx tsx scripts/seed-match-surfaces.ts
 *
 * To add a surface later, insert `{ _id, name, active: true, order }` into `matchSurfaces`;
 * to remove one from new requests, set `active: false` (existing requests keep its name).
 */
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';

dotenv.config();

const DEFAULT_SURFACES = [
  { _id: 'synthetic_grass', name: 'Grama sintética', order: 1 },
  { _id: 'natural_grass', name: 'Grama natural', order: 2 },
  { _id: 'hard_court', name: 'Asfalto/Placa', order: 3 },
  { _id: 'wood', name: 'Madera', order: 4 },
  { _id: 'dirt', name: 'Arena', order: 5 },
];

const connectionString = process.env.MONGODB_CONNECTION_STRING;
if (!connectionString) {
  console.error('Falta MONGODB_CONNECTION_STRING en .env');
  process.exit(1);
}

const client = new MongoClient(connectionString);
try {
  await client.connect();
  const collection = client.db().collection<{ _id: string; name: string; active: boolean; order: number }>('matchSurfaces');
  for (const { _id, name, order } of DEFAULT_SURFACES) {
    const result = await collection.updateOne({ _id }, { $setOnInsert: { name, order, active: true } }, { upsert: true });
    console.log(`${_id}: ${result.upsertedCount === 1 ? 'creada' : 'ya existía'}`);
  }
} finally {
  await client.close();
}
