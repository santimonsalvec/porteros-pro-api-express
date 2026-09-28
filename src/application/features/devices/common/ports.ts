import type { DevicePlatform, PushMessage } from '../../../../domain/devices/deviceRules.js';

export type { DevicePlatform, PushMessage };

/** One phone or tablet that can receive pushes for one user. */
export interface Device {
  token: string;
  userId: string;
  platform: DevicePlatform;
  lastSeenAt: Date;
}

export type DeviceUpsertResult =
  | { kind: 'registered' }
  | { kind: 'refreshed' }
  | { kind: 'transferred'; previousUserId: string };

export interface IDeviceRepository {
  /** One atomic write: creates, refreshes or moves the token to `userId` (research §3). */
  upsert(token: string, userId: string, platform: DevicePlatform, now: Date): Promise<DeviceUpsertResult>;
  /** Keeps the user's `max` most recently seen devices; returns the ones removed. */
  trimToLimit(userId: string, max: number): Promise<Device[]>;
  /** Removes the token only when `userId` owns it. */
  removeOwned(token: string, userId: string): Promise<boolean>;
  removeByTokens(tokens: readonly string[]): Promise<number>;
  findByUserIds(userIds: readonly string[]): Promise<Device[]>;
}

/** `invalid`: the token is dead and must go. `fatal`: our own credentials fail, stop sending. */
export type PushSendOutcome = 'sent' | 'invalid' | 'failed' | 'fatal';

export interface IPushSender {
  /** Never throws: every problem is an outcome (research §6). */
  send(device: Device, message: PushMessage, signal: AbortSignal): Promise<{ outcome: PushSendOutcome; reason?: string }>;
}

export interface UserPushResult {
  reached: number;
  removed: number;
  failed: number;
  /** The user had no device at lookup time. Not an error (FR-014). */
  noDevice: boolean;
}

export interface PushSendResult {
  perUser: Record<string, UserPushResult>;
  totals: { reached: number; removed: number; failed: number; usersWithoutDevice: number };
}

/** What 015 and 019 inject to reach a set of users. */
export interface IPushNotifier {
  /** Never throws (FR-015). Removes the tokens the push service reports invalid (FR-012). */
  sendToUsers(userIds: readonly string[], message: PushMessage): Promise<PushSendResult>;
}

export type RateLimitDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export interface IRateLimiter {
  tryConsume(key: string, limit: number, windowSeconds: number, now: Date): RateLimitDecision;
}

/** A short, non-reversible reference to a token, for logs (FR-022). */
export interface ITokenFingerprint {
  ref(token: string): string;
}

/** The logging devices need, so the application never imports pino. */
export interface IDeviceLogger {
  info(entry: Record<string, unknown>, message: string): void;
  warn(entry: Record<string, unknown>, message: string): void;
  error(entry: Record<string, unknown>, message: string): void;
}
