/**
 * Operations on the admin web's team (porteros-pro-admin spec 001), against the database of this
 * machine's MONGODB_CONNECTION_STRING, until the team screens arrive (spec 002):
 *
 *   npx tsx scripts/staff.ts upsert-role --id soporte --name "Soporte" --permissions cases.read,cases.resolve
 *   npx tsx scripts/staff.ts invite --email ana@example.com --role soporte
 *   npx tsx scripts/staff.ts disable --email ana@example.com
 *   npx tsx scripts/staff.ts enable --email ana@example.com
 *
 * `disable` ends every admin session of the member and refuses to leave no active owner. The
 * first owner is made with `scripts/seed-owner.ts`.
 */
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';
import type { StaffHandlerDependencies } from '../src/infrastructure/staffHandlers.js';
import { SetStaffMemberStatusCommand } from '../src/application/features/staff/commands/setStaffMemberStatus/setStaffMemberStatusCommand.js';
import { SetStaffMemberStatusCommandHandler } from '../src/application/features/staff/commands/setStaffMemberStatus/setStaffMemberStatusCommandHandler.js';
import { UpsertStaffRoleCommand } from '../src/application/features/staff/commands/upsertStaffRole/upsertStaffRoleCommand.js';
import { UpsertStaffRoleCommandHandler } from '../src/application/features/staff/commands/upsertStaffRole/upsertStaffRoleCommandHandler.js';
import { normalizeStaffEmail } from '../src/domain/staff/staffMember.js';
import { SCRIPT_ACTOR } from '../src/domain/staff/staffActor.js';
import { InviteStaffMemberCommand } from '../src/application/features/staff/commands/inviteStaffMember/inviteStaffMemberCommand.js';
import { InviteStaffMemberCommandHandler } from '../src/application/features/staff/commands/inviteStaffMember/inviteStaffMemberCommandHandler.js';
import { MongoAdminSessionStore } from '../src/infrastructure/persistence/mongo/adminSessionStore.js';
import { MongoStaffMemberRepository } from '../src/infrastructure/persistence/mongo/staffMemberRepository.js';
import { MongoStaffRoleRepository } from '../src/infrastructure/persistence/mongo/staffRoleRepository.js';
import { SystemClock } from '../src/infrastructure/systemClock.js';
import { UuidIdGenerator } from '../src/infrastructure/uuidIdGenerator.js';
import { MongoAdminAuditLog } from '../src/infrastructure/persistence/mongo/adminAuditLogRepository.js';
import { scriptAuditEntry } from '../src/infrastructure/audit/scriptAudit.js';

dotenv.config();

const [command, ...rest] = process.argv.slice(2);
const option = (name: string): string | undefined => {
  const index = rest.indexOf(`--${name}`);
  return index === -1 ? undefined : rest[index + 1];
};
const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};

if (!['upsert-role', 'invite', 'disable', 'enable'].includes(command ?? '')) {
  fail('Uso: npx tsx scripts/staff.ts <upsert-role|invite|disable|enable> [opciones]');
}
const connectionString = process.env.MONGODB_CONNECTION_STRING ?? fail('Falta MONGODB_CONNECTION_STRING en .env');
const client = new MongoClient(connectionString);
try {
  await client.connect();
  const db = client.db();
  const members = new MongoStaffMemberRepository(db, () => client.startSession());
  const roles = new MongoStaffRoleRepository(db, () => client.startSession());
  const deps: Pick<StaffHandlerDependencies, 'members' | 'roles' | 'sessions' | 'clock' | 'accessResolver'> = {
    members,
    roles,
    sessions: new MongoAdminSessionStore(db),
    clock: new SystemClock(),
    // The API's own cache (≤ 30 s) notices the change; a script has nothing cached.
    accessResolver: { resolve: async () => null, invalidate: () => undefined },
  };

  const ids = new UuidIdGenerator();
  const auditLog = new MongoAdminAuditLog(db);
  /** Every team change made here leaves the same audit trail as one made in the admin web. */
  const audit = (action: string, resourceType: string, resourceId: string, outcome: string, rejected: boolean) =>
    auditLog.append(
      scriptAuditEntry({ id: ids.newId(), at: deps.clock.now(), script: 'staff', permission: resourceType === 'staffRole' ? 'roles.manage' : 'staff.manage', action, resourceType, resourceId, outcome, rejected }),
    );

  const staffIdOf = async (): Promise<string> => {
    const email = normalizeStaffEmail(option('email') ?? '') ?? fail('Falta --email con un correo válido');
    return (await members.findByEmail(email))?.id ?? fail('Ese correo no es miembro del equipo.');
  };

  switch (command) {
    case 'upsert-role': {
      const permissions = (option('permissions') ?? '').split(',').map((value) => value.trim()).filter(Boolean);
      const result = await new UpsertStaffRoleCommandHandler(deps).handle(
        new UpsertStaffRoleCommand({ id: option('id') ?? '', name: option('name') ?? '', description: option('description') ?? '', permissions }),
      );
      await audit('staffRole.upsert', 'staffRole', option('id') ?? '', result.outcome, !['created', 'updated'].includes(result.outcome));
      console.log(result.outcome === 'invalid' ? `invalid: ${JSON.stringify(result.fieldErrors)}` : result.outcome);
      break;
    }
    case 'disable':
    case 'enable': {
      const staffId = await staffIdOf();
      const result = await new SetStaffMemberStatusCommandHandler(deps).handle(
        new SetStaffMemberStatusCommand(staffId, command === 'disable' ? 'disabled' : 'active', SCRIPT_ACTOR),
      );
      await audit(`staff.${command}`, 'staffMember', staffId, result.outcome, !['disabled', 'enabled', 'unchanged'].includes(result.outcome));
      console.log(result.outcome);
      break;
    }
    case 'invite': {
      const email = option('email') ?? fail('Falta --email');
      const roleId = option('role') ?? fail('Falta --role');
      const result = await new InviteStaffMemberCommandHandler({ ...deps, ids }).handle(new InviteStaffMemberCommand(email, roleId, SCRIPT_ACTOR));
      const invited = result.outcome === 'invited' || result.outcome === 'reinvited';
      await audit('staff.invite', 'staffMember', invited ? result.staffId : '', result.outcome, !invited);
      console.log(invited ? `${result.outcome} (staffId ${result.staffId}); vence en 7 días` : result.outcome);
      break;
    }
    default:
      fail('Uso: npx tsx scripts/staff.ts <upsert-role|invite|disable|enable> [opciones]');
  }
} finally {
  await client.close();
}
