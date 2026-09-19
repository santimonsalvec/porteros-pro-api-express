import type { GoalkeeperProfile } from '../../../../domain/goalkeepers/goalkeeperProfile.js';
import type { IGoalkeeperProfileRepository, IGoalkeeperRegistrationRepository } from './ports.js';

export type ActiveGoalkeeperProfileLookup =
  | { found: true; profile: GoalkeeperProfile }
  /** No registration of any kind — the client never started becoming a goalkeeper. */
  | { found: false; outcome: 'not_a_goalkeeper' }
  /** A draft registration exists but was never activated — use the registration endpoints instead. */
  | { found: false; outcome: 'not_active' };

/**
 * Authorization for editing an active goalkeeper's profile, always decided against the
 * database (the permanent `GoalkeeperProfile` record) — never against the JWT's
 * `isGoalkeeper` claim, which can be stale. Mirrors how that claim itself is derived.
 */
export async function findActiveGoalkeeperProfile(
  profileRepository: IGoalkeeperProfileRepository,
  registrationRepository: IGoalkeeperRegistrationRepository,
  userId: string,
): Promise<ActiveGoalkeeperProfileLookup> {
  const profile = await profileRepository.getByUserId(userId);
  if (profile) return { found: true, profile };

  const registration = await registrationRepository.getByUserId(userId);
  return { found: false, outcome: registration ? 'not_active' : 'not_a_goalkeeper' };
}
