import type { IUserBlockRepository } from './ports.js';

/** Who is blocked, for the app's sign-in and offers (admin spec 005, FR-027, FR-029). */
export type BlockedUsers = Pick<IUserBlockRepository, 'findByUserId'>;

/** Nobody is blocked: the default where no block store is given. */
export const NO_BLOCKED_USERS: BlockedUsers = { findByUserId: async () => null };

export async function isBlocked(blocks: BlockedUsers, userId: string): Promise<boolean> {
  return (await blocks.findByUserId(userId))?.blocked === true;
}
