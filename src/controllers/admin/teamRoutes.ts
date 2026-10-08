import type { ISender } from '../../application/common/mediator/types.js';
import { GetStaffMemberQuery } from '../../application/features/staff/queries/getStaffMember/getStaffMemberQuery.js';
import { ListStaffMembersQuery } from '../../application/features/staff/queries/listStaffMembers/listStaffMembersQuery.js';
import { ApiError } from '../apiError.js';
import { zodFieldErrors } from '../requests/goalkeeperRequests/getServiceQuoteRequest.js';
import {
  changeRoleRequestSchema,
  createRoleRequestSchema,
  inviteRequestSchema,
  listAuditLogQuerySchema,
  listRolesQuerySchema,
  listStaffQuerySchema,
  reasonRequestSchema,
  updateRoleRequestSchema,
} from '../requests/staff/teamRequests.js';
import { ListStaffRolesQuery } from '../../application/features/staff/queries/listStaffRoles/listStaffRolesQuery.js';
import { GetStaffRoleQuery } from '../../application/features/staff/queries/getStaffRole/getStaffRoleQuery.js';
import { CreateStaffRoleCommand } from '../../application/features/staff/commands/createStaffRole/createStaffRoleCommand.js';
import { UpdateStaffRoleCommand } from '../../application/features/staff/commands/updateStaffRole/updateStaffRoleCommand.js';
import { DeleteStaffRoleCommand } from '../../application/features/staff/commands/deleteStaffRole/deleteStaffRoleCommand.js';
import { slugFromName } from '../../domain/staff/staffRole.js';
import { InviteStaffMemberCommand } from '../../application/features/staff/commands/inviteStaffMember/inviteStaffMemberCommand.js';
import { ChangeStaffMemberRoleCommand } from '../../application/features/staff/commands/changeStaffMemberRole/changeStaffMemberRoleCommand.js';
import { SetStaffMemberStatusCommand } from '../../application/features/staff/commands/setStaffMemberStatus/setStaffMemberStatusCommand.js';
import type { StaffActor } from '../../domain/staff/staffActor.js';
import { ListAuditLogQuery } from '../../application/features/staff/queries/listAuditLog/listAuditLogQuery.js';
import { GetAuditEntryQuery } from '../../application/features/staff/queries/getAuditEntry/getAuditEntryQuery.js';
import type { Request, Response } from 'express';
import type { createAdminRouting } from './adminRoute.js';

type Route = ReturnType<typeof createAdminRouting>['route'];

const invalid = (error: Parameters<typeof zodFieldErrors>[0]) =>
  new ApiError(400, 'validation_failed', 'One or more fields are missing or invalid.', zodFieldErrors(error));
const invalidFields = (fieldErrors: Record<string, string>) =>
  new ApiError(400, 'validation_failed', 'One or more fields are missing or invalid.', fieldErrors);
const staffNotFound = () => new ApiError(404, 'staff_not_found', 'No staff member exists with this id.');
const ownersOnly = () => new ApiError(403, 'owner_requires_owner', 'Only an owner can give, take away or act on the owner role.');
const lastOwner = () => new ApiError(409, 'last_owner', 'The team must keep at least one active owner.');
const actorOf = (req: Request): StaffActor => ({ staffId: req.adminAccess!.staffId, isOwner: req.adminAccess!.isOwner });
const roleNotFound = () => new ApiError(404, 'role_not_found', 'No role exists with this id.');
const systemRole = () => new ApiError(409, 'system_role_immutable', 'The owner role cannot be changed.');
const nameTaken = () =>
  new ApiError(409, 'role_name_taken', 'Another role already has this name.', { name: 'Another role already has this name.' });

/** The team in the admin web (spec 002): members, roles and the audit log (contracts/team-api.md). */
export function registerTeamRoutes(route: Route, mediator: ISender): void {
  route('get', '/staff', 'staff.read', async (req, res) => {
    const parsed = listStaffQuerySchema.safeParse(req.query);
    if (!parsed.success) throw invalid(parsed.error);
    const { page, pageSize, ...filters } = parsed.data;
    res.status(200).json(await mediator.send(new ListStaffMembersQuery(filters, page, pageSize)));
  });

  route('get', '/staff/:staffId', 'staff.read', async (req, res) => {
    const result = await mediator.send(new GetStaffMemberQuery(req.params.staffId));
    if (result.outcome === 'staff_not_found') throw staffNotFound();
    res.status(200).json(result.member);
  });

  /** Answers with the member as the list shows it. */
  const sendMember = async (res: Response, staffId: string, status: number) => {
    const result = await mediator.send(new GetStaffMemberQuery(staffId));
    if (result.outcome === 'staff_not_found') throw staffNotFound();
    res.status(status).json(result.member);
  };
  const memberBefore = async (staffId: string) => {
    const result = await mediator.send(new GetStaffMemberQuery(staffId));
    return result.outcome === 'ok' ? result.member : null;
  };
  const memberAudit = (action: string) => ({
    permission: 'staff.manage' as const,
    audit: { action, resourceType: 'staffMember', resourceId: (req: Request) => String(req.params.staffId), before: (req: Request) => memberBefore(String(req.params.staffId)) },
  });

  route(
    'post',
    '/staff',
    {
      permission: 'staff.manage',
      audit: { action: 'staff.invite', resourceType: 'staffMember', resourceId: (req) => String((req.body as { email?: unknown })?.email ?? '').trim().toLowerCase() },
    },
    async (req, res) => {
      const parsed = inviteRequestSchema.safeParse(req.body ?? {});
      if (!parsed.success) throw invalid(parsed.error);
      const result = await mediator.send(new InviteStaffMemberCommand(parsed.data.email, parsed.data.roleId, actorOf(req)));
      switch (result.outcome) {
        case 'invited':
        case 'reinvited':
          await sendMember(res, result.staffId, result.outcome === 'invited' ? 201 : 200);
          return;
        case 'invalid_email':
          throw invalidFields({ email: 'Must be a valid email address.' });
        case 'already_member':
          throw new ApiError(409, 'already_member', 'This email already belongs to the team.');
        case 'role_not_found':
          throw roleNotFound();
        case 'owner_requires_owner':
          throw ownersOnly();
      }
    },
  );

  route('patch', '/staff/:staffId', memberAudit('staff.changeRole'), async (req, res) => {
    const parsed = changeRoleRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) throw invalid(parsed.error);
    const result = await mediator.send(new ChangeStaffMemberRoleCommand(req.params.staffId, parsed.data.roleId, actorOf(req)));
    switch (result.outcome) {
      case 'changed':
      case 'unchanged':
        await sendMember(res, req.params.staffId, 200);
        return;
      case 'staff_not_found':
        throw staffNotFound();
      case 'role_not_found':
        throw roleNotFound();
      case 'owner_requires_owner':
        throw ownersOnly();
      case 'last_owner':
        throw lastOwner();
    }
  });

  for (const action of ['disable', 'enable'] as const) {
    route('post', `/staff/:staffId/${action}`, memberAudit(`staff.${action}`), async (req, res) => {
      const parsed = reasonRequestSchema.safeParse(req.body ?? {});
      if (!parsed.success) throw invalid(parsed.error);
      const status = action === 'disable' ? 'disabled' : 'active';
      const result = await mediator.send(new SetStaffMemberStatusCommand(req.params.staffId, status, actorOf(req)));
      switch (result.outcome) {
        case 'disabled':
        case 'enabled':
        case 'unchanged':
          await sendMember(res, req.params.staffId, 200);
          return;
        case 'not_found':
          throw staffNotFound();
        case 'cannot_disable_self':
          throw new ApiError(409, 'cannot_disable_self', 'You cannot disable yourself.');
        case 'owner_requires_owner':
          throw ownersOnly();
        case 'last_owner':
          throw lastOwner();
      }
    });
  }

  // Roles (US3)
  const roleBefore = async (roleId: string) => {
    const result = await mediator.send(new GetStaffRoleQuery(roleId));
    return result.outcome === 'ok' ? result.role : null;
  };

  route('get', '/roles', 'roles.read', async (req, res) => {
    const parsed = listRolesQuerySchema.safeParse(req.query);
    if (!parsed.success) throw invalid(parsed.error);
    res.status(200).json(await mediator.send(new ListStaffRolesQuery(parsed.data.page, parsed.data.pageSize)));
  });

  route('get', '/roles/:roleId', 'roles.read', async (req, res) => {
    const result = await mediator.send(new GetStaffRoleQuery(req.params.roleId));
    if (result.outcome === 'role_not_found') throw roleNotFound();
    res.status(200).json(result.role);
  });

  route(
    'post',
    '/roles',
    {
      permission: 'roles.manage',
      audit: {
        action: 'staffRole.create',
        resourceType: 'staffRole',
        resourceId: (req) => String((req.body as { id?: unknown })?.id ?? slugFromName(String((req.body as { name?: unknown })?.name ?? '')) ?? ''),
      },
    },
    async (req, res) => {
      const parsed = createRoleRequestSchema.safeParse(req.body ?? {});
      if (!parsed.success) throw invalid(parsed.error);
      const result = await mediator.send(new CreateStaffRoleCommand(parsed.data));
      switch (result.outcome) {
        case 'created':
          res.status(201).json(result.role);
          return;
        case 'invalid':
          throw invalidFields(result.fieldErrors);
        case 'role_name_taken':
          throw nameTaken();
        case 'system_role_immutable':
          throw systemRole();
      }
    },
  );

  route(
    'put',
    '/roles/:roleId',
    {
      permission: 'roles.manage',
      audit: { action: 'staffRole.update', resourceType: 'staffRole', resourceId: (req) => String(req.params.roleId), before: (req) => roleBefore(String(req.params.roleId)) },
    },
    async (req, res) => {
      const parsed = updateRoleRequestSchema.safeParse(req.body ?? {});
      if (!parsed.success) throw invalid(parsed.error);
      const result = await mediator.send(new UpdateStaffRoleCommand(req.params.roleId, parsed.data));
      switch (result.outcome) {
        case 'updated':
          res.status(200).json(result.role);
          return;
        case 'invalid':
          throw invalidFields(result.fieldErrors);
        case 'role_name_taken':
          throw nameTaken();
        case 'system_role_immutable':
          throw systemRole();
        case 'role_not_found':
          throw roleNotFound();
      }
    },
  );

  route(
    'post',
    '/roles/:roleId/delete',
    {
      permission: 'roles.manage',
      audit: { action: 'staffRole.delete', resourceType: 'staffRole', resourceId: (req) => String(req.params.roleId), before: (req) => roleBefore(String(req.params.roleId)) },
    },
    async (req, res) => {
      const parsed = reasonRequestSchema.safeParse(req.body ?? {});
      if (!parsed.success) throw invalid(parsed.error);
      const result = await mediator.send(new DeleteStaffRoleCommand(req.params.roleId));
      switch (result.outcome) {
        case 'deleted':
          // `res.json` is what writes the audit entry: the 204 goes out with an empty body.
          res.status(204).json(null);
          return;
        case 'role_in_use':
          throw new ApiError(409, 'role_in_use', 'This role still has members.', undefined, { memberCount: result.memberCount });
        case 'system_role_immutable':
          throw systemRole();
        case 'role_not_found':
          throw roleNotFound();
      }
    },
  );

  // Audit log (US4): reading it is not audited itself.
  route('get', '/audit-log', 'audit.read', async (req, res) => {
    const parsed = listAuditLogQuerySchema.safeParse(req.query);
    if (!parsed.success) throw invalid(parsed.error);
    const { cursor, limit, ...filters } = parsed.data;
    const result = await mediator.send(new ListAuditLogQuery(filters, cursor ?? null, limit));
    switch (result.outcome) {
      case 'ok':
        res.status(200).json({ items: result.items, nextCursor: result.nextCursor });
        return;
      case 'invalid_cursor':
        throw invalidFields({ cursor: 'Not a cursor from this list.' });
      case 'invalid_range':
        throw invalidFields({ from: 'Must not be after `to`.' });
    }
  });

  route('get', '/audit-log/:entryId', 'audit.read', async (req, res) => {
    const result = await mediator.send(new GetAuditEntryQuery(req.params.entryId));
    if (result.outcome === 'audit_entry_not_found') throw new ApiError(404, 'audit_entry_not_found', 'No audit entry exists with this id.');
    res.status(200).json(result.entry);
  });
}

