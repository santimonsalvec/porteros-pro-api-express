/**
 * Feature 033 (commission rules): `commissionSettings.amount` → `fixedAmount` + `percentBps: 0`.
 * Run it against an environment's database BEFORE the API of feature 033 starts there (the API
 * also reads the old shape, so running it later is safe too). Idempotent: a second run changes
 * nothing.
 *
 *   npx tsx scripts/migrate-033-commission-rules.ts --dry-run   # plans and checks, writes nothing
 *   npx tsx scripts/migrate-033-commission-rules.ts --yes       # applies
 *
 * It never changes a value: the legacy amount becomes the fixed component as is. After writing,
 * every document is read back and verified; any problem exits with status 1.
 */
import dotenv from 'dotenv';
import { MongoClient, type Document } from 'mongodb';
import { planRuleRewrite, verifyRules } from './lib/migrate033.js';

dotenv.config();

const dryRun = process.argv.includes('--dry-run');
const apply = process.argv.includes('--yes');
const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};
if (!dryRun && !apply) fail('Usage: migrate-033-commission-rules.ts --dry-run | --yes');

const connectionString = process.env.MONGODB_CONNECTION_STRING ?? fail('Falta MONGODB_CONNECTION_STRING en .env');
const client = new MongoClient(connectionString);

try {
  await client.connect();
  const collection = client.db().collection('commissionSettings');
  const docs = await collection.find({}).toArray();
  const operations: Parameters<typeof collection.bulkWrite>[0] = [];
  for (const doc of docs) {
    const next = planRuleRewrite(doc);
    if (JSON.stringify(next) !== JSON.stringify(doc)) operations.push({ replaceOne: { filter: { _id: doc._id }, replacement: next as Document } });
  }
  console.log(`${docs.length} commission rules, ${operations.length} to rewrite${dryRun ? ' (dry run, nothing written)' : ''}`);
  if (!dryRun && operations.length > 0) await collection.bulkWrite(operations);

  const after = dryRun ? docs.map(planRuleRewrite) : await collection.find({}).toArray();
  const problems = verifyRules(after);
  if (problems.length > 0) fail(`Verification failed:\n${problems.join('\n')}`);
  console.log(dryRun ? 'Dry run OK: the rewrite would verify.' : 'Done: every rule has fixedAmount and percentBps.');
} finally {
  await client.close();
}
