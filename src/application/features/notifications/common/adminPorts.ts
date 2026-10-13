import type { NotificationItem } from './ports.js';

/**
 * The admin's reads of a user's notices (admin spec 006, US3): every one still stored, the ones
 * the user deleted included, and how many devices could receive them — never their tokens.
 */
export interface INotificationAdminReader {
  listAllForUser(userId: string, skip: number, limit: number): Promise<NotificationItem[]>;
  countAllForUser(userId: string): Promise<number>;
  devicesOf(userId: string): Promise<{ count: number; lastSeenAt: Date | null }>;
}
