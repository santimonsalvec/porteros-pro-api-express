import type { User } from '../../../../domain/users/user.js';
import type { Country } from '../../../../domain/countries/country.js';
import type { IStaffMemberRepository } from '../../staff/common/ports.js';
import type { UserBlockRecord } from './ports.js';
import type { MemberRef, UserBlockView } from './views.js';

/** Shown for a member who left the team (FR of the withdrawals tab, research §13). */
export const FORMER_MEMBER = 'Miembro del equipo';

/** "First Last"; the Google name before the profile is complete; `null` without either. */
export function userName(user: Pick<User, 'firstName' | 'lastName' | 'displayName'>): string | null {
  const full = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return full || user.displayName || null;
}

/** The ISO code of each calling code; the first country wins when several share one (+1). */
export function countryCodesByDialCode(countries: readonly Country[]): Map<string, string> {
  const codes = new Map<string, string>();
  for (const country of countries) if (!codes.has(country.dialCode)) codes.set(country.dialCode, country.countryCode);
  return codes;
}

export async function memberRef(staff: Pick<IStaffMemberRepository, 'findByUserId'>, userId: string | null): Promise<MemberRef | null> {
  if (!userId) return null;
  const member = await staff.findByUserId(userId);
  return { userId, name: member?.displayName ?? member?.email ?? FORMER_MEMBER };
}

export async function blockView(staff: Pick<IStaffMemberRepository, 'findByUserId'>, record: UserBlockRecord | null): Promise<UserBlockView | null> {
  if (!record || (!record.blockedAt && !record.unblockedAt)) return null;
  return {
    blocked: record.blocked,
    blockedAt: record.blockedAt?.toISOString() ?? null,
    blockedBy: await memberRef(staff, record.blockedBy),
    blockReason: record.blockReason,
    unblockedAt: record.unblockedAt?.toISOString() ?? null,
    unblockedBy: await memberRef(staff, record.unblockedBy),
    unblockReason: record.unblockReason,
  };
}
