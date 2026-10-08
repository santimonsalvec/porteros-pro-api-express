/**
 * Makes an email the owner of the admin web in the database of this machine's
 * MONGODB_CONNECTION_STRING (porteros-pro-admin spec 001). Idempotent:
 *
 *   npx tsx scripts/seed-owner.ts --email dueno@example.com
 *
 * - `created`: a new owner invitation; it activates on the first Google sign-in with that email
 *   (the invitation lasts 7 days — run it again to renew it);
 * - `promoted`: the email was already a staff member with another role, now owner;
 * - `unchanged`: it already was an owner.
 *
 * The first owner can only be created this way, never from the admin web.
 */
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';
import { SeedOwnerCommand } from '../src/application/features/staff/commands/seedOwner/seedOwnerCommand.js';
import { SeedOwnerCommandHandler } from '../src/application/features/staff/commands/seedOwner/seedOwnerCommandHandler.js';
import { MongoStaffMemberRepository } from '../src/infrastructure/persistence/mongo/staffMemberRepository.js';
import { MongoStaffRoleRepository } from '../src/infrastructure/persistence/mongo/staffRoleRepository.js';
import { MongoAdminAuditLog } from '../src/infrastructure/persistence/mongo/adminAuditLogRepository.js';
import { scriptAuditEntry } from '../src/infrastructure/audit/scriptAudit.js';
import { SystemClock } from '../src/infrastructure/systemClock.js';
import { UuidIdGenerator } from '../src/infrastructure/uuidIdGenerator.js';

dotenv.config();

const emailIndex = process.argv.indexOf('--email');
const email = emailIndex === -1 ? undefined : process.argv[emailIndex + 1];
if (!email) {
  console.error('Uso: npx tsx scripts/seed-owner.ts --email <correo>');
  process.exit(1);
}
const connectionString = process.env.MONGODB_CONNECTION_STRING;
if (!connectionString) {
  console.error('Falta MONGODB_CONNECTION_STRING en .env');
  process.exit(1);
}

const client = new MongoClient(connectionString);
try {
  await client.connect();
  const db = client.db();
  const members = new MongoStaffMemberRepository(db, () => client.startSession());
  const roles = new MongoStaffRoleRepository(db, () => client.startSession());
  await members.ensureIndexes();
  await roles.ensureIndexes();
  const ids = new UuidIdGenerator();
  const clock = new SystemClock();
  const handler = new SeedOwnerCommandHandler({ members, roles, ids, clock });

  const result = await handler.handle(new SeedOwnerCommand(email));
  // Only the domain of the email: the log never carries a full address.
  const domain = email.split('@')[1] ?? '';
  if (result.outcome === 'invalid_email') {
    console.error('El correo no es válido.');
    process.exitCode = 1;
  } else {
    await new MongoAdminAuditLog(db).append(
      scriptAuditEntry({
        id: ids.newId(),
        at: clock.now(),
        script: 'seed-owner',
        permission: 'staff.manage',
        action: 'staff.seedOwner',
        resourceType: 'staffMember',
        resourceId: result.staffId,
        outcome: result.outcome,
        request: { emailDomain: domain },
      }),
    );
    console.log(`${result.outcome} — dueño @${domain} (staffId ${result.staffId})`);
  }
} finally {
  await client.close();
}
