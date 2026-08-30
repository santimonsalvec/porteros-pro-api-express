import { Entity } from '../common/entity.js';

/**
 * A longer-lived credential issued alongside every access credential, redeemable
 * exactly once at the refresh service. `tokenHash` is the SHA-256 hash of the opaque
 * value handed to the client — the raw value is never persisted.
 */
export class RefreshToken extends Entity<string> {
  readonly userId: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
  isUsed: boolean;
  readonly createdAt: Date;

  constructor(params: {
    id: string;
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    isUsed: boolean;
    createdAt: Date;
  }) {
    super(params.id);
    this.userId = params.userId;
    this.tokenHash = params.tokenHash;
    this.expiresAt = params.expiresAt;
    this.isUsed = params.isUsed;
    this.createdAt = params.createdAt;
  }

  static create(id: string, userId: string, tokenHash: string, lifetimeMs: number): RefreshToken {
    const now = new Date();
    return new RefreshToken({
      id,
      userId,
      tokenHash,
      expiresAt: new Date(now.getTime() + lifetimeMs),
      isUsed: false,
      createdAt: now,
    });
  }

  isActive(now: Date = new Date()): boolean {
    return !this.isUsed && this.expiresAt.getTime() > now.getTime();
  }

  markUsed(): void {
    this.isUsed = true;
  }
}
