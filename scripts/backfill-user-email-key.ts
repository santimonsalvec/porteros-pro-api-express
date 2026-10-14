/**
 * Gives the accounts made before porteros-pro-admin spec 009 their `emailKey` (research §4), against
 * the database of this machine's MONGODB_CONNECTION_STRING. Run it before deploying 009: the API
 * builds the unique `emailKey_unique` index on start, and only the oldest account of a repeated
 * email gets the key.
 *
 *   npx tsx scripts/backfill-user-email-key.ts --dry-run   # prints the plan, writes nothing
 *   npx tsx scripts/backfill-user-email-key.ts             # writes the keys
 *
 * The repeated emails are listed by account id: review them by hand.
 */
import dotenv from 'dotenv';
import { MongoClient, type Document } from 'mongodb';
import { planEmailKeyBackfill, type BackfillUser } from '../src/infrastructure/persistence/mongo/emailKeyBackfill.js';

dotenv.config();

const dryRun = process.argv.includes('--dry-run');
const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};

const connectionString = process.env.MONGODB_CONNECTION_STRING ?? fail('Falta MONGODB_CONNECTION_STRING en .env');
const client = new MongoClient(connectionString);
try {
  await client.connect();
  const users = client.db().collection('users');
  const docs = await users.find({}, { projection: { email: 1, createdAt: 1, emailKey: 1, 'externalIdentities.subject': 1 } }).toArray();
  const plan = planEmailKeyBackfill(docs.map(toBackfillUser));

  console.log(`Cuentas leídas: ${docs.length}. Claves por escribir: ${plan.updates.length}.`);
  for (const group of plan.duplicates) {
    console.log(`Correo repetido (${group.emailKey.replace(/^(.).*@/, '$1***@')}): se queda ${group.keptId}; sin clave: ${group.skippedIds.join(', ')}`);
  }
  if (plan.invalidIds.length > 0) console.log(`Cuentas con un correo que no es válido: ${plan.invalidIds.join(', ')}`);

  if (dryRun) {
    console.log('Modo --dry-run: no se escribió nada.');
  } else if (plan.updates.length > 0) {
    const result = await users.bulkWrite(
      plan.updates.map(({ id, emailKey }) => ({
        updateOne: { filter: { _id: id, emailKey: { $exists: false } } as Document, update: { $set: { emailKey } } },
      })),
    );
    console.log(`Claves escritas: ${result.modifiedCount}.`);
  }
} finally {
  await client.close();
}

function toBackfillUser(doc: Document): BackfillUser {
  const identities = (doc.externalIdentities as { subject?: unknown }[] | undefined) ?? [];
  const createdAt = doc.createdAt && typeof doc.createdAt === 'object' && 'DateTime' in doc.createdAt ? doc.createdAt.DateTime : doc.createdAt;
  return {
    id: String(doc._id),
    email: typeof doc.email === 'string' ? doc.email : '',
    createdAt: new Date(createdAt as string | Date),
    emailKey: typeof doc.emailKey === 'string' ? doc.emailKey : null,
    hasExternalIdentity: identities.some((identity) => typeof identity.subject === 'string'),
  };
}
