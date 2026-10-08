import type { AdminSession, AdminSessionRevokedReason } from '../../../../domain/staff/adminSession.js';
import type { AuditEntry } from '../../../../domain/staff/auditEntry.js';
import type { Permission } from '../../../../domain/staff/permissionCatalog.js';
import type { StaffMember, StaffStatus } from '../../../../domain/staff/staffMember.js';
import type { AuditOutcome } from '../../../../domain/staff/auditEntry.js';
import type { AuditPosition } from './auditCursor.js';
import type { StaffRole } from '../../../../domain/staff/staffRole.js';

export interface IStaffMemberRepository {
  getById(id: string): Promise<StaffMember | null>;
  /** By normalized email. */
  findByEmail(email: string): Promise<StaffMember | null>;
  findByUserId(userId: string): Promise<StaffMember | null>;
  add(member: StaffMember): Promise<void>;
  update(member: StaffMember): Promise<void>;
  /**
   * Saves a change of status or role in one transaction that fails, writing nothing, when it would
   * leave no active owner (spec 001, FR-004).
   */
  saveGuardingOwners(member: StaffMember): Promise<'saved' | 'last_owner'>;
  /** A page of members, by email; `q` is a case-insensitive prefix of the email or the name. */
  list(query: StaffMemberListQuery): Promise<{ items: StaffMember[]; totalItems: number }>;
  /** How many members have each of these roles (absent = 0). */
  countByRole(roleIds: readonly string[]): Promise<Map<string, number>>;
}

export interface StaffMemberListQuery {
  status?: StaffStatus;
  roleId?: string;
  q?: string;
  page: number;
  pageSize: number;
}

export interface IStaffRoleRepository {
  getById(id: string): Promise<StaffRole | null>;
  upsert(role: StaffRole): Promise<void>;
  /** Creates the `owner` system role when missing; idempotent. */
  ensureOwner(now: Date): Promise<StaffRole>;
  /** A page of roles: the owner first, then by name. */
  list(page: number, pageSize: number): Promise<{ items: StaffRole[]; totalItems: number }>;
  /** Inserts a new role; `name_taken` when another one has that name (any case). */
  create(role: StaffRole): Promise<'created' | 'name_taken'>;
  /** Replaces an existing role; `name_taken` when another one has that name (any case). */
  save(role: StaffRole): Promise<'saved' | 'name_taken'>;
  /** Deletes a role only while nobody has it, in one transaction (spec 002, FR-013). */
  deleteIfUnused(roleId: string): Promise<'deleted' | 'in_use' | 'not_found'>;
}

export interface IAdminSessionStore {
  add(session: AdminSession): Promise<void>;
  getById(id: string): Promise<AdminSession | null>;
  findByRefreshHash(refreshTokenHash: string): Promise<AdminSession | null>;
  findByPreviousRefreshHash(refreshTokenHash: string): Promise<AdminSession | null>;
  /** Saves the session only while its stored refresh hash is still `expectedHash`: one rotation wins. */
  replaceIfCurrent(session: AdminSession, expectedHash: string): Promise<boolean>;
  update(session: AdminSession): Promise<void>;
  /** Revokes every open session of the member and returns their ids. */
  revokeAllForStaff(staffId: string, reason: AdminSessionRevokedReason, now: Date): Promise<string[]>;
}

export interface AdminAccessTokenClaims {
  userId: string;
  sessionId: string;
  staffId: string;
}

export interface AdminAccessToken {
  accessToken: string;
  expiresInSeconds: number;
}

/** Access tokens of the admin web: a different audience from the app's, so neither works on the other. */
export interface IAdminTokenIssuer {
  issueAccessToken(claims: AdminAccessTokenClaims): Promise<AdminAccessToken>;
  verifyAccessToken(token: string): Promise<AdminAccessTokenClaims | null>;
  /** A fresh opaque refresh value; only its hash is ever stored. */
  newRefreshToken(): string;
  hashRefreshToken(rawRefreshToken: string): string;
}

/** Appends to the administration audit log; there is no update nor delete. */
export interface IAdminAuditLog {
  append(entry: AuditEntry): Promise<void>;
}

export interface AuditLogQuery {
  staffId?: string;
  resourceType?: string;
  action?: string;
  outcome?: AuditOutcome;
  from?: Date;
  to?: Date;
  /** Entries strictly older than this position. */
  after?: AuditPosition;
  limit: number;
}

/** Reads the audit log, newest first (spec 002). */
export interface IAdminAuditLogReader {
  list(query: AuditLogQuery): Promise<AuditEntry[]>;
  getById(id: string): Promise<AuditEntry | null>;
}

export interface ResolvedStaffAccess {
  session: AdminSession;
  member: StaffMember;
  role: StaffRole;
  permissions: Permission[];
  isOwner: boolean;
}

/**
 * The session, member and role behind an admin access token, cached briefly per session (30 s), so
 * a revoked session, a disabled member or a changed role takes effect within that delay.
 */
export interface IStaffAccessResolver {
  resolve(sessionId: string): Promise<ResolvedStaffAccess | null>;
  /** Forgets one session, or every cached one when called without an id. */
  invalidate(sessionId?: string): void;
}

/** Security log of the admin web's sessions: never the email, the Google token nor any refresh value. */
export interface AdminSecurityEvent {
  event: 'admin_sign_in' | 'admin_refresh' | 'admin_sign_out';
  outcome: string;
  staffId?: string;
  sessionId?: string;
}

export interface IAdminSecurityLog {
  log(event: AdminSecurityEvent): void;
}
