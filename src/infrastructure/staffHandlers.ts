import type { HandlerRegistration } from '../application/common/mediator/mediator.js';
import type { IClock } from '../application/common/clock.js';
import type { IGoogleIdTokenValidator, IIdGenerator, IUserRepository } from '../application/features/auth/common/ports.js';
import type {
  IAdminAuditLogReader,
  IAdminSecurityLog,
  IAdminSessionStore,
  IAdminTokenIssuer,
  IStaffAccessResolver,
  IStaffMemberRepository,
  IStaffRoleRepository,
} from '../application/features/staff/common/ports.js';
import { SignInAdminCommand } from '../application/features/staff/commands/signInAdmin/signInAdminCommand.js';
import { SignInAdminCommandHandler } from '../application/features/staff/commands/signInAdmin/signInAdminCommandHandler.js';
import { RefreshAdminSessionCommand } from '../application/features/staff/commands/refreshAdminSession/refreshAdminSessionCommand.js';
import { RefreshAdminSessionCommandHandler } from '../application/features/staff/commands/refreshAdminSession/refreshAdminSessionCommandHandler.js';
import { SignOutAdminCommand } from '../application/features/staff/commands/signOutAdmin/signOutAdminCommand.js';
import { SignOutAdminCommandHandler } from '../application/features/staff/commands/signOutAdmin/signOutAdminCommandHandler.js';
import { InviteStaffMemberCommand } from '../application/features/staff/commands/inviteStaffMember/inviteStaffMemberCommand.js';
import { InviteStaffMemberCommandHandler } from '../application/features/staff/commands/inviteStaffMember/inviteStaffMemberCommandHandler.js';
import { ListStaffMembersQuery } from '../application/features/staff/queries/listStaffMembers/listStaffMembersQuery.js';
import { ListStaffMembersQueryHandler } from '../application/features/staff/queries/listStaffMembers/listStaffMembersQueryHandler.js';
import { GetStaffMemberQuery } from '../application/features/staff/queries/getStaffMember/getStaffMemberQuery.js';
import { GetStaffMemberQueryHandler } from '../application/features/staff/queries/getStaffMember/getStaffMemberQueryHandler.js';
import { ListStaffRolesQuery } from '../application/features/staff/queries/listStaffRoles/listStaffRolesQuery.js';
import { ListStaffRolesQueryHandler } from '../application/features/staff/queries/listStaffRoles/listStaffRolesQueryHandler.js';
import { GetStaffRoleQuery } from '../application/features/staff/queries/getStaffRole/getStaffRoleQuery.js';
import { GetStaffRoleQueryHandler } from '../application/features/staff/queries/getStaffRole/getStaffRoleQueryHandler.js';
import { CreateStaffRoleCommand } from '../application/features/staff/commands/createStaffRole/createStaffRoleCommand.js';
import { CreateStaffRoleCommandHandler } from '../application/features/staff/commands/createStaffRole/createStaffRoleCommandHandler.js';
import { UpdateStaffRoleCommand } from '../application/features/staff/commands/updateStaffRole/updateStaffRoleCommand.js';
import { UpdateStaffRoleCommandHandler } from '../application/features/staff/commands/updateStaffRole/updateStaffRoleCommandHandler.js';
import { DeleteStaffRoleCommand } from '../application/features/staff/commands/deleteStaffRole/deleteStaffRoleCommand.js';
import { DeleteStaffRoleCommandHandler } from '../application/features/staff/commands/deleteStaffRole/deleteStaffRoleCommandHandler.js';
import { ChangeStaffMemberRoleCommand } from '../application/features/staff/commands/changeStaffMemberRole/changeStaffMemberRoleCommand.js';
import { ChangeStaffMemberRoleCommandHandler } from '../application/features/staff/commands/changeStaffMemberRole/changeStaffMemberRoleCommandHandler.js';
import { ListAuditLogQuery } from '../application/features/staff/queries/listAuditLog/listAuditLogQuery.js';
import { ListAuditLogQueryHandler } from '../application/features/staff/queries/listAuditLog/listAuditLogQueryHandler.js';
import { GetAuditEntryQuery } from '../application/features/staff/queries/getAuditEntry/getAuditEntryQuery.js';
import { GetAuditEntryQueryHandler } from '../application/features/staff/queries/getAuditEntry/getAuditEntryQueryHandler.js';
import { SeedOwnerCommand } from '../application/features/staff/commands/seedOwner/seedOwnerCommand.js';
import { SeedOwnerCommandHandler } from '../application/features/staff/commands/seedOwner/seedOwnerCommandHandler.js';
import { GetAdminMeQuery } from '../application/features/staff/queries/getAdminMe/getAdminMeQuery.js';
import { GetAdminMeQueryHandler } from '../application/features/staff/queries/getAdminMe/getAdminMeQueryHandler.js';
import { GetPermissionCatalogQuery } from '../application/features/staff/queries/getPermissionCatalog/getPermissionCatalogQuery.js';
import { GetPermissionCatalogQueryHandler } from '../application/features/staff/queries/getPermissionCatalog/getPermissionCatalogQueryHandler.js';
import { SetStaffMemberStatusCommand } from '../application/features/staff/commands/setStaffMemberStatus/setStaffMemberStatusCommand.js';
import { SetStaffMemberStatusCommandHandler } from '../application/features/staff/commands/setStaffMemberStatus/setStaffMemberStatusCommandHandler.js';
import { UpsertStaffRoleCommand } from '../application/features/staff/commands/upsertStaffRole/upsertStaffRoleCommand.js';
import { UpsertStaffRoleCommandHandler } from '../application/features/staff/commands/upsertStaffRole/upsertStaffRoleCommandHandler.js';

export interface StaffHandlerDependencies {
  google: IGoogleIdTokenValidator;
  users: IUserRepository;
  members: IStaffMemberRepository;
  roles: IStaffRoleRepository;
  sessions: IAdminSessionStore;
  tokens: IAdminTokenIssuer;
  ids: IIdGenerator;
  clock: IClock;
  securityLog: IAdminSecurityLog;
  accessResolver: IStaffAccessResolver;
  auditLog: IAdminAuditLogReader;
}

/**
 * The admin web's staff handlers (porteros-pro-admin spec 001), shared by the composition root and
 * the HTTP tests' fake-backed one so both register exactly the same set.
 */
export function staffHandlerRegistrations(deps: StaffHandlerDependencies): HandlerRegistration[] {
  return [
    { requestType: SignInAdminCommand, handler: new SignInAdminCommandHandler(deps) },
    { requestType: RefreshAdminSessionCommand, handler: new RefreshAdminSessionCommandHandler(deps) },
    { requestType: SignOutAdminCommand, handler: new SignOutAdminCommandHandler(deps) },
    { requestType: SeedOwnerCommand, handler: new SeedOwnerCommandHandler(deps) },
    { requestType: InviteStaffMemberCommand, handler: new InviteStaffMemberCommandHandler(deps) },
    { requestType: GetAdminMeQuery, handler: new GetAdminMeQueryHandler(deps) },
    { requestType: ListStaffMembersQuery, handler: new ListStaffMembersQueryHandler(deps) },
    { requestType: GetStaffMemberQuery, handler: new GetStaffMemberQueryHandler(deps) },
    { requestType: ListStaffRolesQuery, handler: new ListStaffRolesQueryHandler(deps) },
    { requestType: GetStaffRoleQuery, handler: new GetStaffRoleQueryHandler(deps) },
    { requestType: CreateStaffRoleCommand, handler: new CreateStaffRoleCommandHandler(deps) },
    { requestType: UpdateStaffRoleCommand, handler: new UpdateStaffRoleCommandHandler(deps) },
    { requestType: DeleteStaffRoleCommand, handler: new DeleteStaffRoleCommandHandler(deps) },
    { requestType: ListAuditLogQuery, handler: new ListAuditLogQueryHandler(deps) },
    { requestType: GetAuditEntryQuery, handler: new GetAuditEntryQueryHandler(deps) },
    { requestType: GetPermissionCatalogQuery, handler: new GetPermissionCatalogQueryHandler() },
    { requestType: ChangeStaffMemberRoleCommand, handler: new ChangeStaffMemberRoleCommandHandler(deps) },
    { requestType: SetStaffMemberStatusCommand, handler: new SetStaffMemberStatusCommandHandler(deps) },
    { requestType: UpsertStaffRoleCommand, handler: new UpsertStaffRoleCommandHandler(deps) },
  ];
}
