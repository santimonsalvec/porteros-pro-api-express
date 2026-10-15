/**
 * Feature 029 (store compliance): wallet → operating balance, top-up → deposit, in storage. Run it
 * against an environment's database BEFORE the API of feature 029 starts there, and never again
 * after: it is idempotent, so a second run changes nothing.
 *
 *   npx tsx scripts/migrate-029-operating-balance.ts --dry-run   # plans and checks, writes nothing
 *   npx tsx scripts/migrate-029-operating-balance.ts --yes       # applies
 *
 * It renames three collections, rewrites the movements, notices, staff roles and audit entries that
 * carry an old name, drops the old reconcile job lock and the old index. It never changes an
 * amount: the totals are checked before writing (in memory) and again after (from the database),
 * and any difference exits with status 1. The movements are read whole, which is fine for the
 * dataset of a pre-production system.
 */
import dotenv from 'dotenv';
import { MongoClient, type Db, type Document } from 'mongodb';
import {
  COLLECTION_RENAMES,
  OBSOLETE_JOB_LOCKS,
  mentionsOldTerm,
  rewriteAuditEntry,
  rewriteMovement,
  rewriteNotification,
  rewriteStaffRole,
  totalsOf,
  verifyTotals,
  type Totals,
} from './lib/migrate029.js';

dotenv.config();

const dryRun = process.argv.includes('--dry-run');
const apply = process.argv.includes('--yes');
const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};
if (!dryRun && !apply) fail('Usage: migrate-029-operating-balance.ts --dry-run | --yes');

const connectionString = process.env.MONGODB_CONNECTION_STRING ?? fail('Falta MONGODB_CONNECTION_STRING en .env');
const OLD_PERMISSIONS = ['wallets.read', 'wallets.adjust', 'topups.read', 'topups.reconcile'];
const OLD_ACTIONS = ['wallet.adjust', 'topUp.reconcile', 'topUps.export'];
const OLD_RESOURCES = ['wallet', 'topUp', 'topUps'];

async function exists(db: Db, name: string): Promise<boolean> {
  return (await db.listCollections({ name }, { nameOnly: true }).toArray()).length > 0;
}

/** The collection to read now: the new name when it exists (already migrated), else the old one. */
async function currentName(db: Db, from: string, to: string): Promise<string | null> {
  if (await exists(db, to)) return to;
  return (await exists(db, from)) ? from : null;
}

async function readTotals(db: Db): Promise<Totals> {
  const [balancesName, movementsName] = await Promise.all([
    currentName(db, 'wallets', 'operatingBalances'),
    currentName(db, 'walletMovements', 'balanceMovements'),
  ]);
  const balances = balancesName ? await db.collection(balancesName).find({}, { projection: { balance: 1 } }).toArray() : [];
  const movements = movementsName
    ? await db.collection(movementsName).find({}, { projection: { walletId: 1, operatingBalanceId: 1, amount: 1 } }).toArray()
    : [];
  return totalsOf(balances as never, movements as never);
}

/** `replaceOne`s for the documents `rewrite` changes; returns how many there are. */
async function rewriteCollection(db: Db, name: string, filter: Document, rewrite: (doc: Document) => Document): Promise<number> {
  if (!(await exists(db, name))) return 0;
  const collection = db.collection(name);
  const operations: Parameters<typeof collection.bulkWrite>[0] = [];
  for await (const doc of collection.find(filter)) {
    const next = rewrite(doc);
    if (JSON.stringify(next) !== JSON.stringify(doc)) operations.push({ replaceOne: { filter: { _id: doc._id }, replacement: next } });
  }
  if (!dryRun && operations.length > 0) await collection.bulkWrite(operations);
  return operations.length;
}

const client = new MongoClient(connectionString);
try {
  await client.connect();
  const db = client.db();

  for (const { from, to } of COLLECTION_RENAMES) {
    if ((await exists(db, from)) && (await exists(db, to))) fail(`Both ${from} and ${to} exist: resolve by hand before migrating.`);
  }

  const before = await readTotals(db);
  const preProblems = verifyTotals(before, before);
  if (preProblems.length > 0) fail(`The data is not consistent before migrating:\n${preProblems.join('\n')}`);
  console.log(`Antes: ${before.balanceCount} saldos, ${before.movementCount} movimientos, suma ${before.movementSum}.`);

  for (const { from, to } of COLLECTION_RENAMES) {
    if (!(await exists(db, from))) {
      console.log(`${from} → ${to}: nada que renombrar.`);
      continue;
    }
    console.log(`${from} → ${to}${dryRun ? ' (simulado)' : ''}`);
    if (!dryRun) await db.renameCollection(from, to);
  }

  // In a dry run the collections are not renamed yet, so the rewrite reads the old names.
  const nameAfterRename = (from: string, to: string): string => (dryRun ? from : to);
  const movementsChanged = await rewriteCollection(db, nameAfterRename('walletMovements', 'balanceMovements'), {}, rewriteMovement);
  const noticesChanged = await rewriteCollection(
    db,
    'notifications',
    { $or: [{ type: /^wallet\./ }, { 'data.topUpId': { $exists: true } }, { 'data.type': /^wallet\./ }] },
    rewriteNotification,
  );
  const rolesChanged = await rewriteCollection(db, 'staffRoles', { permissions: { $in: OLD_PERMISSIONS } }, rewriteStaffRole);
  const auditChanged = await rewriteCollection(
    db,
    'adminAuditLog',
    { $or: [{ action: { $in: OLD_ACTIONS } }, { resourceType: { $in: OLD_RESOURCES } }] },
    rewriteAuditEntry,
  );
  console.log(`Reescritos: ${movementsChanged} movimientos, ${noticesChanged} avisos, ${rolesChanged} roles, ${auditChanged} entradas de auditoría.`);

  if (!dryRun) {
    const locks = await db.collection('jobLocks').deleteMany({ _id: { $in: [...OBSOLETE_JOB_LOCKS] } } as Document);
    console.log(`Bloqueos de tarea antiguos eliminados: ${locks.deletedCount}.`);
    const movements = db.collection('balanceMovements');
    const indexes = (await exists(db, 'balanceMovements')) ? await movements.indexes() : [];
    if (indexes.some((index) => index.name === 'wallet_sequence_unique')) {
      await movements.dropIndex('wallet_sequence_unique');
      console.log('Índice wallet_sequence_unique eliminado; la API crea balance_sequence_unique al iniciar.');
    }
  }

  if (!dryRun) {
    const after = await readTotals(db);
    const problems = verifyTotals(before, after);
    console.log(`Después: ${after.balanceCount} saldos, ${after.movementCount} movimientos, suma ${after.movementSum}.`);
    if (problems.length > 0) fail(`MISMATCH:\n${problems.join('\n')}`);
    const outbox = (await exists(db, 'outbox')) ? await db.collection('outbox').find({}).toArray() : [];
    const leftovers = outbox.filter(mentionsOldTerm).length;
    if (leftovers > 0) console.log(`Aviso: ${leftovers} eventos pendientes del outbox aún mencionan un nombre antiguo; revísalos.`);
    console.log('Migración 029 aplicada y verificada.');
  } else {
    console.log('Modo --dry-run: no se escribió nada.');
  }
} finally {
  await client.close();
}
