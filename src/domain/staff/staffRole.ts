import { Entity } from '../common/entity.js';
import { isPermission, PERMISSION_CATALOG, type Permission } from './permissionCatalog.js';

/** The protected system role: every permission, present and future; never edited nor deleted. */
export const OWNER_ROLE_ID = 'owner';

const ROLE_ID_PATTERN = /^[a-z][a-z0-9-]{1,39}$/;
export const ROLE_NAME_MIN = 2;
export const ROLE_NAME_MAX = 60;
export const ROLE_DESCRIPTION_MAX = 300;

export interface StaffRoleInput {
  id: string;
  name: string;
  description: string;
  permissions: readonly string[];
}

export interface StaffRoleProps {
  id: string;
  name: string;
  description: string;
  permissions: readonly string[];
  system: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * The id of a role named `name`: lower case, without accents, words joined by dashes, at most 40
 * characters, starting with a letter. Null when nothing usable is left.
 */
export function slugFromName(name: string): string | null {
  const slug = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
  return ROLE_ID_PATTERN.test(slug) ? slug : null;
}

export class SystemRoleImmutableError extends Error {
  constructor(roleId: string) {
    super(`Role ${roleId} is a system role and cannot be changed`);
  }
}

export class StaffRoleValidationError extends Error {
  constructor(readonly fieldErrors: Record<string, string>) {
    super('Invalid staff role');
  }
}

/** Field errors for a custom role (empty when valid); messages are for the operator, in English like the API's. */
export function validateStaffRoleInput(input: StaffRoleInput): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!ROLE_ID_PATTERN.test(input.id)) {
    errors.id = 'Must be 2–40 lowercase letters, digits or dashes, starting with a letter.';
  } else if (input.id === OWNER_ROLE_ID) {
    errors.id = 'The owner role is reserved.';
  }
  const name = input.name.trim();
  if (name.length < ROLE_NAME_MIN || name.length > ROLE_NAME_MAX) {
    errors.name = `Must be ${ROLE_NAME_MIN}–${ROLE_NAME_MAX} characters.`;
  }
  if (input.description.trim().length > ROLE_DESCRIPTION_MAX) {
    errors.description = `Must be at most ${ROLE_DESCRIPTION_MAX} characters.`;
  }
  if (new Set(input.permissions).size !== input.permissions.length) {
    errors.permissions = 'Must not repeat a permission.';
  } else if (!input.permissions.every(isPermission)) {
    errors.permissions = 'Every permission must belong to the catalog.';
  }
  return errors;
}

/** A named list of catalog permissions given to staff members; `owner` is the one system role. */
export class StaffRole extends Entity<string> {
  readonly name: string;
  readonly description: string;
  readonly permissions: readonly string[];
  readonly system: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: StaffRoleProps) {
    super(props.id);
    this.name = props.name;
    this.description = props.description;
    this.permissions = [...props.permissions];
    this.system = props.system;
    this.createdAt = new Date(props.createdAt);
    this.updatedAt = new Date(props.updatedAt);
  }

  static owner(now: Date): StaffRole {
    return new StaffRole({ id: OWNER_ROLE_ID, name: 'Dueño', description: '', permissions: [], system: true, createdAt: now, updatedAt: now });
  }

  /** A custom role; throws `StaffRoleValidationError` when `validateStaffRoleInput` finds errors. */
  static create(input: StaffRoleInput, now: Date): StaffRole {
    const errors = validateStaffRoleInput(input);
    if (Object.keys(errors).length > 0) throw new StaffRoleValidationError(errors);
    return new StaffRole({ ...trimmed(input), system: false, createdAt: now, updatedAt: now });
  }

  static rehydrate(props: StaffRoleProps): StaffRole {
    return new StaffRole(props);
  }

  get isOwner(): boolean {
    return this.id === OWNER_ROLE_ID;
  }

  /**
   * The permissions this role grants, in catalog order: the whole catalog for the owner, otherwise
   * the role's own (a permission retired from the catalog is ignored rather than failing).
   */
  effectivePermissions(): Permission[] {
    if (this.isOwner) return [...PERMISSION_CATALOG];
    const granted = new Set(this.permissions);
    return PERMISSION_CATALOG.filter((permission) => granted.has(permission));
  }

  withChanges(changes: Omit<StaffRoleInput, 'id'>, now: Date): StaffRole {
    if (this.system) throw new SystemRoleImmutableError(this.id);
    const errors = validateStaffRoleInput({ ...changes, id: this.id });
    if (Object.keys(errors).length > 0) throw new StaffRoleValidationError(errors);
    return new StaffRole({ ...trimmed({ ...changes, id: this.id }), system: false, createdAt: this.createdAt, updatedAt: now });
  }
}

function trimmed(input: StaffRoleInput): StaffRoleInput {
  return { id: input.id, name: input.name.trim(), description: input.description.trim(), permissions: [...input.permissions] };
}
