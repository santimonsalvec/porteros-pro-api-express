/**
 * Development only: adds a small modality/level price matrix (feature 024) to test the tiered
 * rates and commissions, on the database of this machine's MONGODB_CONNECTION_STRING.
 *
 *   npx tsx scripts/dev-seed-format-rates.ts <cityId> <countryId>
 *   npx tsx scripts/dev-seed-format-rates.ts --remove
 *
 * Every document it writes has an id starting with `dev-024-`, so `--remove` deletes exactly them
 * and leaves the general rates and commissions untouched. Modalities without a row here (Fútbol
 * medio, Cualquiera) keep using the general price.
 */
import dotenv from 'dotenv';
import { MongoClient, type Document } from 'mongodb';

dotenv.config();

const PREFIX = 'dev-024-';
const RATES: { modality: string; level?: string; amounts: Record<60 | 90 | 120, number> }[] = [
  { modality: 'futbol_11', amounts: { 60: 60000, 90: 75000, 120: 90000 } },
  { modality: 'futbol_11', level: 'competitive', amounts: { 60: 70000, 90: 85000, 120: 100000 } },
  { modality: 'micro_futsal', amounts: { 60: 35000, 90: 45000, 120: 55000 } },
];
const COMMISSIONS: { modality: string; level?: string; amount: number }[] = [
  { modality: 'futbol_11', amount: 10000 },
  { modality: 'futbol_11', level: 'competitive', amount: 12000 },
  { modality: 'micro_futsal', amount: 5000 },
];

const connectionString = process.env.MONGODB_CONNECTION_STRING;
if (!connectionString) {
  console.error('Falta MONGODB_CONNECTION_STRING en .env');
  process.exit(1);
}
const [first, countryId] = process.argv.slice(2);
const remove = first === '--remove';
if (!remove && (!first || !countryId)) {
  console.error('Uso: npx tsx scripts/dev-seed-format-rates.ts <cityId> <countryId> | --remove');
  process.exit(1);
}

const client = new MongoClient(connectionString);
try {
  await client.connect();
  const rates = client.db().collection<Document>('rentalRates');
  const commissions = client.db().collection<Document>('commissionSettings');
  const ours = { _id: { $regex: `^${PREFIX}` } } as Document;
  if (remove) {
    console.log(`tarifas borradas: ${(await rates.deleteMany(ours)).deletedCount}`);
    console.log(`comisiones borradas: ${(await commissions.deleteMany(ours)).deletedCount}`);
  } else {
    for (const { modality, level, amounts } of RATES) {
      for (const [duration, amount] of Object.entries(amounts)) {
        const _id = `${PREFIX}rate-${modality}-${level ?? 'all'}-${duration}`;
        const doc = { scope: 'city', refId: first, durationMinutes: Number(duration), amount, modality, ...(level ? { level } : {}) };
        await rates.replaceOne({ _id } as Document, doc, { upsert: true });
        console.log(`tarifa ${_id}: ${amount}`);
      }
    }
    for (const { modality, level, amount } of COMMISSIONS) {
      const _id = `${PREFIX}commission-${modality}-${level ?? 'all'}`;
      await commissions.replaceOne({ _id } as Document, { scope: 'country', refId: countryId, amount, modality, ...(level ? { level } : {}) }, { upsert: true });
      console.log(`comisión ${_id}: ${amount}`);
    }
  }
} finally {
  await client.close();
}
