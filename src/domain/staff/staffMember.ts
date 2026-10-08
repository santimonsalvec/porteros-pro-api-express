import { Entity } from '../common/entity.js';

export type StaffStatus = 'invited' | 'active' | 'disabled';

/** An invitation nobody used within 7 days stops granting access (spec 001, FR-007). */
export const INVITATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

const EMAIL_MAX = 254;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Trimmed and lower-cased, or `null` when it is not an email address. */
export function normalizeStaffEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  if (email.length < 3 || email.length > EMAIL_MAX || !EMAIL_PATTERN.test(email)) return null;
  return email;
}

export class StaffMemberTransitionError extends Error {}

export interface StaffMemberProps {
  id: string;
  email: string;
  displayName: string | null;
  userId: string | null;
  roleIds: readonly string[];
  status: StaffStatus;
  invitedBy: string;
  invitedAt: Date;
  inviteExpiresAt: Date | null;
  createdAt: Date;
  lastSignInAt: Date | null;
  updatedAt: Date;
}

/**
 * A person with access to the admin web. Access depends on this record — never on the account's
 * `isAdmin` flag. Exactly one role for now, stored as a list so several roles need no migration.
 */
export class StaffMember extends Entity<string> {
  readonly email: string;
  readonly displayName: string | null;
  readonly userId: string | null;
  readonly roleIds: readonly string[];
  readonly status: StaffStatus;
  readonly invitedBy: string;
  readonly invitedAt: Date;
  readonly inviteExpiresAt: Date | null;
  readonly createdAt: Date;
  readonly lastSignInAt: Date | null;
  readonly updatedAt: Date;

  private constructor(props: StaffMemberProps) {
    super(props.id);
    if (props.roleIds.length !== 1) throw new Error('A staff member has exactly one role');
    this.email = props.email;
    this.displayName = props.displayName;
    this.userId = props.userId;
    this.roleIds = [...props.roleIds];
    this.status = props.status;
    this.invitedBy = props.invitedBy;
    this.invitedAt = new Date(props.invitedAt);
    this.inviteExpiresAt = props.inviteExpiresAt ? new Date(props.inviteExpiresAt) : null;
    this.createdAt = new Date(props.createdAt);
    this.lastSignInAt = props.lastSignInAt ? new Date(props.lastSignInAt) : null;
    this.updatedAt = new Date(props.updatedAt);
  }

  static invite(params: { id: string; email: string; roleId: string; invitedBy: string }, now: Date): StaffMember {
    const email = normalizeStaffEmail(params.email);
    if (!email) throw new Error('Invalid staff email');
    return new StaffMember({
      id: params.id,
      email,
      displayName: null,
      userId: null,
      roleIds: [params.roleId],
      status: 'invited',
      invitedBy: params.invitedBy,
      invitedAt: now,
      inviteExpiresAt: expiryFrom(now),
      createdAt: now,
      lastSignInAt: null,
      updatedAt: now,
    });
  }

  static rehydrate(props: StaffMemberProps): StaffMember {
    return new StaffMember(props);
  }

  get roleId(): string {
    return this.roleIds[0]!;
  }

  /** Only an active member may hold a session; an invitation becomes active on its first sign-in. */
  hasAccess(): boolean {
    return this.status === 'active';
  }

  isInvitationValid(now: Date): boolean {
    return this.status === 'invited' && this.inviteExpiresAt !== null && now < this.inviteExpiresAt;
  }

  reinvite(roleId: string, invitedBy: string, now: Date): StaffMember {
    if (this.status !== 'invited') throw new StaffMemberTransitionError(`Staff member ${this.id} is ${this.status}`);
    return this.with({ roleIds: [roleId], invitedBy, invitedAt: now, inviteExpiresAt: expiryFrom(now), updatedAt: now });
  }

  activate(userId: string, displayName: string | null, now: Date): StaffMember {
    if (!this.isInvitationValid(now)) throw new StaffMemberTransitionError(`Staff member ${this.id} has no valid invitation`);
    return this.with({ status: 'active', userId, displayName, inviteExpiresAt: null, lastSignInAt: now, updatedAt: now });
  }

  recordSignIn(now: Date): StaffMember {
    return this.with({ lastSignInAt: now, updatedAt: now });
  }

  disable(now: Date): StaffMember {
    if (this.status === 'disabled') throw new StaffMemberTransitionError(`Staff member ${this.id} is already disabled`);
    return this.with({ status: 'disabled', updatedAt: now });
  }

  /** Back to active when linked to an account; an unlinked one becomes a fresh 7-day invitation. */
  enable(now: Date): StaffMember {
    if (this.status !== 'disabled') throw new StaffMemberTransitionError(`Staff member ${this.id} is not disabled`);
    if (this.userId) return this.with({ status: 'active', updatedAt: now });
    return this.with({ status: 'invited', invitedAt: now, inviteExpiresAt: expiryFrom(now), updatedAt: now });
  }

  changeRole(roleId: string, now: Date): StaffMember {
    return this.with({ roleIds: [roleId], updatedAt: now });
  }

  private with(changes: Partial<StaffMemberProps>): StaffMember {
    return new StaffMember({ ...this.props(), ...changes });
  }

  private props(): StaffMemberProps {
    return {
      id: this.id,
      email: this.email,
      displayName: this.displayName,
      userId: this.userId,
      roleIds: this.roleIds,
      status: this.status,
      invitedBy: this.invitedBy,
      invitedAt: this.invitedAt,
      inviteExpiresAt: this.inviteExpiresAt,
      createdAt: this.createdAt,
      lastSignInAt: this.lastSignInAt,
      updatedAt: this.updatedAt,
    };
  }
}

function expiryFrom(now: Date): Date {
  return new Date(now.getTime() + INVITATION_LIFETIME_MS);
}
